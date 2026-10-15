<?php

namespace App\Services;

use App\Models\Historico;
use App\Models\Lancamento;

/** Altera e exclui itens registrando cada mudança no histórico (no lote em andamento) */
class LancamentoService
{
    /** Atualiza o item e registra no histórico cada campo que mudou */
    public function atualizar(Lancamento $lancamento, array $dados): Lancamento
    {
        $antes = $this->rastreados($lancamento);
        $nomeAntes = $lancamento->nome;
        $eraFixo = $lancamento->ehGastoFixo();
        $acompanhava = $lancamento->real !== null && abs($lancamento->real - $lancamento->valor) < 0.005;

        $grupoAntes = $lancamento->grupo;

        $lancamento->fill($dados);

        // Mudou de grupo (Cartão ↔ PIX): vai para o fim da lista do novo grupo, a menos que a ordem tenha sido informada
        if ($lancamento->grupo !== $grupoAntes && ! array_key_exists('ordem', $dados)) {
            $lancamento->ordem = (int) Lancamento::where('mes_id', $lancamento->mes_id)->where('grupo', $lancamento->grupo)->max('ordem') + 1;
        }

        // Gasto fixo e assinatura já têm o Real preenchido (igual ao valor). Se o Real não foi informado:
        // ao virar fixo e estar em branco, é preenchido; se o valor mudar e o Real acompanhava o valor, acompanha de novo.
        // Se deixar de ser fixo e o Real era só esse preenchimento automático, volta a ficar em aberto.
        if (! array_key_exists('real', $dados)) {
            if ($lancamento->ehGastoFixo()) {
                if (! $eraFixo && $lancamento->real === null) {
                    $lancamento->real = $lancamento->valor;
                } elseif (array_key_exists('valor', $dados) && $acompanhava) {
                    $lancamento->real = $lancamento->valor;
                }
            } elseif ($eraFixo && $acompanhava) {
                $lancamento->real = null;
            }
        }

        $lancamento->save();
        $depois = $this->rastreados($lancamento);

        foreach (Historico::CAMPOS as $campo) {
            if ($antes[$campo] !== $depois[$campo]) {
                Historico::registrar($lancamento, 'alterou', [
                    'nome' => $nomeAntes,
                    'campo' => $campo,
                    'antes' => Historico::texto($antes[$campo]),
                    'depois' => Historico::texto($depois[$campo]),
                ]);
            }
        }

        return $lancamento;
    }

    /** Exclui guardando o item inteiro, para poder restaurá-lo ao desfazer */
    public function excluir(Lancamento $lancamento): void
    {
        Historico::registrar($lancamento, 'excluiu', [
            'antes' => Historico::texto($lancamento->valor),
            'dados' => $lancamento->getAttributes(),
        ]);
        $lancamento->delete();
    }

    /** Campos acompanhados no histórico, já normalizados para comparação */
    private function rastreados(Lancamento $l): array
    {
        return $l->only(['nome', 'valor', 'real', 'pago', 'recorrente', 'essencial', 'variavel', 'grupo'])
            + ['vencimento' => $l->vencimentoTexto(), 'parcela' => $l->parcelaTexto()];
    }
}
