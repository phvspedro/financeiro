<?php

namespace App\Services;

use App\Models\Historico;
use App\Models\Lancamento;
use App\Models\Mes;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class MesService
{
    public function __construct(private Auditoria $auditoria, private LancamentoService $lancamentos) {}

    /**
     * Retorna o mês do usuário; se ainda não existir, cria e já traz
     * os fixos/recorrentes e parcelas do mês anterior mais próximo.
     */
    public function abrir(User $user, int $ano, int $mes): Mes
    {
        $competencia = Carbon::create($ano, $mes, 1)->toDateString();

        $existente = Mes::where('user_id', $user->id)->whereDate('competencia', $competencia)->first();
        if ($existente) {
            return $existente;
        }

        try {
            return DB::transaction(function () use ($user, $competencia) {
                $novo = Mes::create(['user_id' => $user->id, 'competencia' => $competencia]);
                $this->importarFixos($novo, automatico: true);

                return $novo;
            });
        } catch (UniqueConstraintViolationException) {
            // Outra requisição criou o mesmo mês ao mesmo tempo
            return Mes::where('user_id', $user->id)->whereDate('competencia', $competencia)->firstOrFail();
        }
    }

    /**
     * Copia para $destino os itens fixos e parcelas do mês anterior mais próximo.
     * Itens com o mesmo nome no mesmo grupo não são duplicados.
     * Retorna quantos itens foram copiados.
     */
    public function importarFixos(Mes $destino, bool $automatico = false): int
    {
        $anterior = $destino->anterior();
        if (! $anterior) {
            return 0;
        }

        $rotulo = ($automatico ? 'Mês criado com os fixos e parcelas de ' : 'Trouxe os fixos e parcelas de ').$anterior->rotulo();

        return $this->auditoria->comLote($rotulo, fn () => $this->copiar($anterior, $destino)['criados'], $automatico);
    }

    /**
     * Replica $origem para os meses $destinos ([[ano, mes], ...], todos depois de $origem).
     * Meses que ainda não existem são criados; itens que já existem (mesmo grupo e nome)
     * não são duplicados. Tudo fica num único lote do histórico, para poder ser desfeito de uma vez.
     *
     * @param  list<array{0: int, 1: int}>  $destinos
     * @return array{criados: int, atualizados: int, meses: list<string>}
     */
    public function replicar(User $user, Mes $origem, array $destinos, bool $tudo = true, bool $atualizar = false, bool $comEstado = false): array
    {
        $rotulo = 'Replicou '.$origem->rotulo().' para '.count($destinos).(count($destinos) === 1 ? ' mês' : ' meses');

        return DB::transaction(fn () => $this->auditoria->comLote($rotulo, function () use ($user, $origem, $destinos, $tudo, $atualizar, $comEstado, $rotulo) {
            $total = ['criados' => 0, 'atualizados' => 0, 'meses' => []];

            foreach ($destinos as [$ano, $mes]) {
                $destino = Mes::firstOrCreate(['user_id' => $user->id, 'competencia' => Carbon::create($ano, $mes, 1)->toDateString()]);
                $resultado = $this->copiar($origem, $destino, $tudo, $atualizar, $comEstado);

                $total['criados'] += $resultado['criados'];
                $total['atualizados'] += $resultado['atualizados'];
                $total['meses'][] = $destino->rotulo();
            }

            if ($total['criados'] + $total['atualizados'] > 0) {
                // Marca na origem, para a replicação aparecer (e poder ser desfeita) no histórico do mês de onde saiu
                Historico::create([
                    'mes_id' => $origem->id,
                    'user_id' => auth()->id(),
                    'acao' => 'replicou',
                    'lote' => $this->auditoria->lote(),
                    'rotulo' => $rotulo,
                    'dados' => $total,
                ]);
            }

            return $total;
        }));
    }

    /**
     * Copia os itens de $origem para $destino, ajustando as parcelas pela distância entre os meses.
     * Por padrão leva só fixos e parcelados; $tudo leva também os avulsos.
     * Real e pago começam zerados no destino; $comEstado copia também o real e o pago.
     * Itens que já existem no destino são mantidos (com $atualizar, só o valor é atualizado).
     * Cada item criado/alterado entra no histórico, no lote em andamento.
     *
     * @return array{criados: int, atualizados: int}
     */
    public function copiar(Mes $origem, Mes $destino, bool $tudo = false, bool $atualizar = false, bool $comEstado = false): array
    {
        $distancia = ($destino->competencia->year - $origem->competencia->year) * 12
            + ($destino->competencia->month - $origem->competencia->month);

        $existentes = $destino->lancamentos()->get()->keyBy(fn (Lancamento $l) => $this->chave($l));
        $criados = $atualizados = 0;

        foreach ($origem->lancamentos as $item) {
            if (! ($tudo || $item->recorrente || $item->parcela_total)) {
                continue;
            }

            $parcela = $item->projetar($distancia);
            if ($parcela === null) {
                continue; // parcelado que já terá acabado
            }

            $atual = $existentes->get($this->chave($item));
            if ($atual) {
                if ($atualizar && abs($atual->valor - $item->valor) > 0.004) {
                    $this->lancamentos->atualizar($atual, ['valor' => $item->valor]);
                    $atualizados++;
                }

                continue;
            }

            $novo = $destino->lancamentos()->create([
                'grupo' => $item->grupo,
                'nome' => $item->nome,
                'valor' => $item->valor,
                // Fixos e assinaturas já vêm com o Real preenchido; o resto fica em aberto (amarelo)
                'real' => $comEstado ? $item->real : ($item->ehGastoFixo() ? $item->valor : null),
                'vencimento' => $item->vencimentoNoMes($destino),
                'pago' => $comEstado && $item->pago,
                'recorrente' => $item->recorrente,
                'essencial' => $item->essencial,
                'variavel' => $item->variavel,
                'ordem' => $item->ordem,
            ] + $parcela);
            Historico::registrar($novo, 'criou', ['depois' => Historico::texto($novo->valor)]);
            $criados++;
        }

        return ['criados' => $criados, 'atualizados' => $atualizados];
    }

    /**
     * Leva o que este item é agora (fixo, parcelado ou avulso, com as parcelas) para os meses seguintes
     * que já existem. Itens do mesmo grupo e nome são ajustados; onde falta, é criado; depois da última
     * parcela (ou se virou avulso), é removido. Com $comValor, o valor também é atualizado.
     * Se um parcelado vai além do último mês existente, os meses que faltam são criados, um a um, até o mês
     * da última parcela, cada um usando o mês anterior (o último já criado) como base.
     * Tudo num único lote do histórico, que dá para desfazer.
     *
     * @return array{criados: int, atualizados: int, removidos: int, meses: int, novos_meses: list<string>}
     */
    public function propagar(User $user, Lancamento $item, bool $comValor = false): array
    {
        $origem = $item->mes;
        $rotulo = "Aplicou \"{$item->nome}\" aos meses seguintes";
        $continua = $item->recorrente || $item->parcela_total;
        $nome = mb_strtolower(trim($item->nome));

        return DB::transaction(fn () => $this->auditoria->comLote($rotulo, function () use ($user, $item, $origem, $comValor, $continua, $nome) {
            $total = ['criados' => 0, 'atualizados' => 0, 'removidos' => 0, 'meses' => 0, 'novos_meses' => []];

            $seguintes = Mes::where('user_id', $user->id)
                ->whereDate('competencia', '>', $origem->competencia->toDateString())
                ->orderBy('competencia')
                ->get();

            foreach ($seguintes as $mes) {
                $distancia = ($mes->competencia->year - $origem->competencia->year) * 12 + ($mes->competencia->month - $origem->competencia->month);
                $parcela = $continua ? $item->projetar($distancia) : null;
                $iguais = $mes->lancamentos()->where('grupo', $item->grupo)->get()
                    ->filter(fn (Lancamento $l) => mb_strtolower(trim($l->nome)) === $nome);
                $mexeu = false;

                if ($parcela === null) {
                    foreach ($iguais as $l) {
                        $this->lancamentos->excluir($l);
                        $total['removidos']++;
                        $mexeu = true;
                    }
                } elseif ($iguais->isEmpty()) {
                    $novo = $mes->lancamentos()->create([
                        'grupo' => $item->grupo,
                        'nome' => $item->nome,
                        'valor' => $item->valor,
                        'real' => $item->ehGastoFixo() ? $item->valor : null,
                        'vencimento' => $item->vencimentoNoMes($mes),
                        'recorrente' => $item->recorrente,
                        'essencial' => $item->essencial,
                        'variavel' => $item->variavel,
                        'ordem' => $item->ordem,
                    ] + $parcela);
                    Historico::registrar($novo, 'criou', ['depois' => Historico::texto($novo->valor)]);
                    $total['criados']++;
                    $mexeu = true;
                } else {
                    foreach ($iguais as $l) {
                        $dados = ['recorrente' => $item->recorrente, 'essencial' => $item->essencial, 'variavel' => $item->variavel] + $parcela;
                        if ($comValor) {
                            $dados['valor'] = $item->valor;
                        }
                        $this->lancamentos->atualizar($l, $dados);
                        if ($l->wasChanged()) {
                            $total['atualizados']++;
                            $mexeu = true;
                        }
                    }
                }

                $total['meses'] += $mexeu ? 1 : 0;
            }

            // Parcelado que passa do último mês existente: cria os meses até a última parcela
            if ($item->parcela_total && ! $item->recorrente) {
                $restantes = $item->parcela_total - ($item->parcela_atual ?? 1);
                $ultimo = $seguintes->last() ?? $origem;
                $alvo = $origem->competencia->copy()->addMonthsNoOverflow($restantes);

                while ($ultimo->competencia->lt($alvo)) {
                    $proximo = Mes::create(['user_id' => $user->id, 'competencia' => $ultimo->competencia->copy()->addMonthNoOverflow()->toDateString()]);
                    $total['criados'] += $this->copiar($ultimo->unsetRelation('lancamentos'), $proximo)['criados'];
                    $total['novos_meses'][] = $proximo->rotulo();
                    $total['meses']++;
                    $ultimo = $proximo;
                }
            }

            if ($total['meses'] > 0) {
                // Marca na origem, para a ação aparecer (e poder ser desfeita) no mês onde foi feita
                Historico::create([
                    'mes_id' => $origem->id,
                    'user_id' => auth()->id(),
                    'acao' => 'propagou',
                    'grupo' => $item->grupo,
                    'nome' => $item->nome,
                    'lote' => $this->auditoria->lote(),
                    'rotulo' => "Aplicou \"{$item->nome}\" aos meses seguintes",
                    'dados' => $total,
                ]);
            }

            return $total;
        }));
    }

    private function chave(Lancamento $l): string
    {
        return $l->grupo.'|'.mb_strtolower(trim($l->nome));
    }
}
