<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Historico;
use App\Models\Mes;
use App\Services\DesfazerService;
use App\Services\MesService;
use Illuminate\Http\Request;

class MesController extends Controller
{
    public function __construct(private MesService $meses) {}

    public function show(Request $request, int $ano, int $mes)
    {
        $registro = $this->meses->abrir($request->user(), $ano, $mes);

        return $this->payload($registro);
    }

    public function update(Request $request, int $ano, int $mes)
    {
        $dados = $request->validate(['observacao' => ['nullable', 'string', 'max:5000']]);
        $registro = $this->meses->abrir($request->user(), $ano, $mes);
        $registro->update($dados);

        return $this->payload($registro);
    }

    public function importarFixos(Request $request, int $ano, int $mes)
    {
        $registro = $this->meses->abrir($request->user(), $ano, $mes);
        $copiados = $this->meses->importarFixos($registro);

        return $this->payload($registro->fresh()) + ['copiados' => $copiados];
    }

    public function historico(Request $request, int $ano, int $mes, DesfazerService $desfazer)
    {
        $registro = $this->meses->abrir($request->user(), $ano, $mes);
        $linhas = $registro->historicos()->limit(800)->get();

        // Em quantos meses cada lote mexeu de fato (replicar atinge vários), para avisar antes de desfazer
        $meses = Historico::whereIn('lote', $linhas->pluck('lote')->filter()->unique())
            ->groupBy('lote')
            ->selectRaw("lote, count(distinct case when acao in ('criou', 'alterou', 'excluiu') then mes_id end) as n")
            ->pluck('n', 'lote');

        return [
            'linhas' => $linhas->map(fn (Historico $h) => ($h->acao === 'replicou' ? $h : $h->makeHidden('dados'))->toArray() + ['lote_meses' => (int) ($meses[$h->lote] ?? 1)]),
            'pilha' => $desfazer->pilha($registro),
        ];
    }

    /** Competências ('YYYY-MM') que o usuário já tem, para o replicar avisar o que já existe */
    public function existentes(Request $request)
    {
        return Mes::where('user_id', $request->user()->id)->orderBy('competencia')->get()
            ->map(fn (Mes $m) => $m->competencia->format('Y-m'))->values();
    }

    /** Replica o mês inteiro (cópia) para os meses seguintes */
    public function replicar(Request $request, int $ano, int $mes)
    {
        $dados = $request->validate([
            'meses' => ['required', 'array', 'min:1', 'max:24'],
            'meses.*' => ['required', 'distinct', 'regex:/^\d{4}-(0[1-9]|1[0-2])$/'],
            'modo' => ['sometimes', 'in:fixos,tudo'],
            'atualizar' => ['sometimes', 'boolean'],
            'estado' => ['sometimes', 'boolean'],
        ]);

        $origem = $this->meses->abrir($request->user(), $ano, $mes);
        $destinos = collect($dados['meses'])->sort()->map(fn (string $c) => array_map('intval', explode('-', $c)))->values()->all();

        foreach ($destinos as [$a, $m]) {
            if (($a - $ano) * 12 + ($m - $mes) <= 0) {
                return response()->json(['message' => 'Escolha apenas meses depois de '.$origem->rotulo().'.'], 422);
            }
        }

        return $this->meses->replicar($request->user(), $origem, $destinos, ($dados['modo'] ?? 'tudo') === 'tudo', (bool) ($dados['atualizar'] ?? false), (bool) ($dados['estado'] ?? false));
    }

    /** Resumo dos 12 meses do ano (só meses que já foram abertos) */
    public function anual(Request $request, int $ano)
    {
        $registros = Mes::with('lancamentos')
            ->where('user_id', $request->user()->id)
            ->whereYear('competencia', $ano)
            ->get()
            ->keyBy(fn (Mes $m) => (int) $m->competencia->format('n'));

        $meses = [];
        foreach (range(1, 12) as $n) {
            $meses[] = ['mes' => $n] + ($registros->has($n) ? $registros[$n]->totais() : ['vazio' => true]);
        }

        return ['ano' => $ano, 'meses' => $meses];
    }

    private function payload(Mes $registro): array
    {
        $registro->load('lancamentos');

        // Valores do mês anterior, para mostrar o que mudou (chave: grupo|nome)
        $anterior = [];
        foreach ($registro->anterior()?->lancamentos ?? [] as $l) {
            $anterior[$l->grupo.'|'.mb_strtolower(trim($l->nome))] = $l->valor;
        }

        return [
            'mes' => $registro->only(['id', 'competencia', 'observacao']),
            'lancamentos' => $registro->lancamentos,
            'totais' => $registro->totais(),
            'anterior' => (object) $anterior,
        ];
    }
}
