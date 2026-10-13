<?php

namespace App\Services;

use App\Exceptions\DesfazerConflito;
use App\Models\Historico;
use App\Models\Lancamento;
use App\Models\Mes;
use App\Models\User;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Desfaz ações registradas no histórico.
 *
 * Cada ação do usuário é um "lote". Desfazer um lote aplica o inverso de cada linha (da mais nova
 * para a mais antiga) e grava esse inverso como um novo lote ("Desfez: ..."), então o histórico só
 * cresce e o próprio desfazer pode ser desfeito (refazer).
 *
 * Uma linha só é revertida se o item ainda estiver como ela o deixou. Se algo mudou depois, nada é
 * alterado e o usuário é avisado (DesfazerConflito), para nunca sobrescrever alterações mais novas.
 */
class DesfazerService
{
    private const ACOES = ['criou', 'alterou', 'excluiu'];

    /** @return array{descricao: string, lote: string, meses: int} */
    public function desfazer(User $user, string $lote): array
    {
        return DB::transaction(function () use ($user, $lote) {
            $linhas = Historico::where('lote', $lote)
                ->whereHas('mes', fn ($q) => $q->where('user_id', $user->id))
                ->orderByDesc('id')
                ->get();

            if ($linhas->isEmpty()) {
                throw new ModelNotFoundException;
            }
            if ($linhas->contains(fn (Historico $l) => $l->desfeito_por)) {
                throw new DesfazerConflito('Esta ação já foi desfeita.');
            }

            $acionaveis = $linhas->whereIn('acao', self::ACOES);
            $marcas = $linhas->whereNotIn('acao', self::ACOES);
            if ($acionaveis->isEmpty()) {
                throw new DesfazerConflito('Não há nada para desfazer nesta ação.');
            }

            $desfeito = $linhas->first()->reverte_lote; // este lote era um "desfazer"?
            $descricao = Historico::descreverLote($linhas);
            $rotulo = ($desfeito ? 'Refez: ' : 'Desfez: ').preg_replace('/^(Desfez|Refez): /', '', $descricao);
            $novo = (string) Str::uuid();

            foreach ($acionaveis as $linha) {
                $this->reverter($linha, $novo, $rotulo);
            }
            // Marcas (ex.: "replicou", gravada só no mês de origem) são espelhadas, para o refazer aparecer lá também
            foreach ($marcas as $marca) {
                Historico::create([
                    'mes_id' => $marca->mes_id, 'user_id' => auth()->id(), 'acao' => $marca->acao, 'dados' => $marca->dados,
                    'lote' => $novo, 'rotulo' => $rotulo, 'reverte_lote' => $lote,
                ]);
            }

            Historico::where('lote', $lote)->update(['desfeito_por' => $novo]);
            if ($desfeito) {
                // desfazer um "desfazer" devolve a ação original ao estado de ativa
                Historico::where('lote', $desfeito)->where('desfeito_por', $lote)->update(['desfeito_por' => null]);
            }

            return ['descricao' => $descricao, 'lote' => $novo, 'meses' => $acionaveis->pluck('mes_id')->unique()->count()];
        });
    }

    /** Desfaz, de uma vez, todas as ações do mês feitas depois de $lote (que permanece). Retorna quantas. */
    public function voltarAte(User $user, Mes $mes, string $lote): int
    {
        return DB::transaction(function () use ($user, $mes, $lote) {
            $referencia = Historico::where('mes_id', $mes->id)->where('lote', $lote)->max('id');
            if ($referencia === null) {
                throw new ModelNotFoundException;
            }

            $posteriores = Historico::where('mes_id', $mes->id)
                ->whereNotNull('lote')
                ->whereNull('desfeito_por')
                ->whereNull('reverte_lote')
                ->groupBy('lote')
                ->havingRaw('min(id) > ?', [$referencia])
                ->orderByRaw('max(id) desc')
                ->pluck('lote');

            foreach ($posteriores as $posterior) {
                $this->desfazer($user, $posterior);
            }

            return $posteriores->count();
        });
    }

    /** O que Ctrl+Z e Ctrl+Y fariam agora neste mês (ou null) */
    public function pilha(Mes $mes): array
    {
        $linhas = Historico::where('mes_id', $mes->id)
            ->whereNotNull('lote')
            ->whereNull('desfeito_por')
            ->orderByDesc('id')
            ->limit(600)
            ->get(['id', 'lote', 'rotulo', 'acao', 'campo', 'nome', 'grupo', 'lancamento_id', 'reverte_lote', 'automatico'])
            ->groupBy('lote');

        $resumo = fn ($grupo) => $grupo
            ? ['lote' => $grupo->first()->lote, 'descricao' => Historico::descreverLote($grupo), 'itens' => $grupo->whereIn('acao', self::ACOES)->count()]
            : null;

        $ultimo = $linhas->first();
        $desfazer = $linhas->first(fn ($g) => $g->first()->reverte_lote === null && ! $g->first()->automatico);

        // Só dá para refazer se o último passo do mês foi um "desfazer" (qualquer ação nova limpa o refazer)
        $refazer = null;
        $reverte = $ultimo?->first()->reverte_lote;
        if ($reverte && Historico::where('lote', $reverte)->whereNull('reverte_lote')->exists()) {
            $refazer = $ultimo;
        }

        return ['desfazer' => $resumo($desfazer), 'refazer' => $resumo($refazer)];
    }

    private function reverter(Historico $linha, string $novo, string $rotulo): void
    {
        $item = $linha->lancamento_id ? Lancamento::find($linha->lancamento_id) : null;
        $nome = "\"{$linha->nome}\"";

        $inverso = [
            'mes_id' => $linha->mes_id,
            'user_id' => auth()->id(),
            'lancamento_id' => $linha->lancamento_id,
            'grupo' => $linha->grupo,
            'nome' => $linha->nome,
            'lote' => $novo,
            'rotulo' => $rotulo,
            'reverte_lote' => $linha->lote,
        ];

        switch ($linha->acao) {
            case 'criou':
                if (! $item) {
                    throw new DesfazerConflito("{$nome} não existe mais.");
                }
                $mexeuDepois = Historico::where('lancamento_id', $item->id)
                    ->where('id', '>', $linha->id)
                    ->where('lote', '!=', $linha->lote)
                    ->whereNull('desfeito_por')
                    ->whereNull('reverte_lote')
                    ->whereIn('acao', ['alterou', 'excluiu'])
                    ->exists();
                if ($mexeuDepois) {
                    throw new DesfazerConflito("{$nome} foi alterado depois de ser criado. Desfaça primeiro as alterações mais recentes.");
                }

                $foto = $item->getAttributes();
                $item->delete();
                Historico::create($inverso + ['acao' => 'excluiu', 'antes' => Historico::texto($item->valor), 'dados' => $foto]);
                break;

            case 'excluiu':
                if ($item) {
                    throw new DesfazerConflito("{$nome} já existe.");
                }
                if (! $linha->dados || ! Mes::whereKey($linha->dados['mes_id'] ?? 0)->exists()) {
                    throw new DesfazerConflito("Não foi possível restaurar {$nome}: o registro é antigo e não guardou os dados do item.");
                }

                $restaurado = Lancamento::unguarded(fn () => Lancamento::create($linha->dados));
                Historico::create($inverso + ['acao' => 'criou', 'depois' => Historico::texto($restaurado->valor)]);
                break;

            case 'alterou':
                if (! $item) {
                    throw new DesfazerConflito("{$nome} não existe mais.");
                }
                if (! $this->igual($linha->campo, $this->campo($item, $linha->campo), $linha->depois)) {
                    throw new DesfazerConflito("{$nome} foi alterado depois desta ação. Desfaça primeiro as alterações mais recentes.");
                }

                $this->definir($item, $linha->campo, $linha->antes);
                $item->save();
                Historico::create(array_merge($inverso, [
                    'acao' => 'alterou',
                    'nome' => $linha->campo === 'nome' ? $linha->depois : $linha->nome,
                    'campo' => $linha->campo,
                    'antes' => $linha->depois,
                    'depois' => $linha->antes,
                ]));
                break;
        }
    }

    private function campo(Lancamento $item, string $campo): ?string
    {
        return match ($campo) {
            'parcela' => $item->parcelaTexto(),
            'vencimento' => $item->vencimentoTexto(),
            default => Historico::texto($item->{$campo}),
        };
    }

    private function igual(string $campo, ?string $a, ?string $b): bool
    {
        if (in_array($campo, ['valor', 'real'], true) && $a !== null && $b !== null) {
            return abs((float) $a - (float) $b) < 0.005;
        }

        return $a === $b;
    }

    private function definir(Lancamento $item, string $campo, ?string $valor): void
    {
        if ($campo === 'parcela') {
            $ok = $valor !== null && preg_match('#^(\d+)/(\d+)$#', $valor, $m);
            $item->parcela_atual = $ok ? (int) $m[1] : null;
            $item->parcela_total = $ok ? (int) $m[2] : null;

            return;
        }

        $item->{$campo} = match ($campo) {
            'valor' => (float) ($valor ?? 0),
            'real' => $valor === null ? null : (float) $valor,
            'vencimento' => $valor ?: null,
            'pago', 'recorrente', 'essencial', 'variavel' => $valor === '1',
            default => (string) $valor,
        };
    }
}
