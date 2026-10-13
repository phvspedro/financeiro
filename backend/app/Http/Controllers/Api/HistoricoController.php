<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\DesfazerConflito;
use App\Http\Controllers\Controller;
use App\Models\Mes;
use App\Services\DesfazerService;
use Illuminate\Http\Request;

class HistoricoController extends Controller
{
    public function __construct(private DesfazerService $desfazer) {}

    /** Desfaz (ou refaz, se o lote for um "desfazer") uma ação específica do histórico */
    public function desfazerLote(Request $request, string $lote)
    {
        return $this->tentar(fn () => $this->desfazer->desfazer($request->user(), $lote));
    }

    /** Ctrl+Z: desfaz a última ação do mês */
    public function desfazerUltima(Request $request, int $ano, int $mes)
    {
        return $this->ultima($request, $ano, $mes, 'desfazer', 'Não há nada para desfazer neste mês.');
    }

    /** Ctrl+Y: refaz o último "desfazer" do mês */
    public function refazer(Request $request, int $ano, int $mes)
    {
        return $this->ultima($request, $ano, $mes, 'refazer', 'Não há nada para refazer.');
    }

    /** Volta o mês ao estado logo depois da ação $lote, desfazendo tudo o que veio depois */
    public function voltarAte(Request $request, int $ano, int $mes)
    {
        $lote = $request->validate(['lote' => ['required', 'uuid']])['lote'];
        $registro = $this->mes($request, $ano, $mes);

        return $this->tentar(fn () => ['desfeitas' => $this->desfazer->voltarAte($request->user(), $registro, $lote)]);
    }

    public function pilha(Request $request, int $ano, int $mes)
    {
        $registro = Mes::where('user_id', $request->user()->id)->whereDate('competencia', sprintf('%04d-%02d-01', $ano, $mes))->first();

        return $registro ? $this->desfazer->pilha($registro) : ['desfazer' => null, 'refazer' => null];
    }

    private function ultima(Request $request, int $ano, int $mes, string $qual, string $vazio)
    {
        $alvo = $this->desfazer->pilha($this->mes($request, $ano, $mes))[$qual];
        if (! $alvo) {
            return response()->json(['message' => $vazio], 422);
        }

        return $this->tentar(fn () => $this->desfazer->desfazer($request->user(), $alvo['lote']));
    }

    private function mes(Request $request, int $ano, int $mes): Mes
    {
        return Mes::where('user_id', $request->user()->id)
            ->whereDate('competencia', sprintf('%04d-%02d-01', $ano, $mes))
            ->firstOrFail();
    }

    private function tentar(callable $acao)
    {
        try {
            return $acao();
        } catch (DesfazerConflito $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }
    }
}
