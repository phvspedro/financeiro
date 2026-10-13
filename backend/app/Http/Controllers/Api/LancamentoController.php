<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Historico;
use App\Models\Lancamento;
use App\Services\Auditoria;
use App\Services\LancamentoService;
use App\Services\MesService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class LancamentoController extends Controller
{
    public function __construct(private MesService $meses, private LancamentoService $lancamentos) {}

    public function store(Request $request, int $ano, int $mes)
    {
        $dados = $request->validate($this->regras(true));
        $registro = $this->meses->abrir($request->user(), $ano, $mes);

        $dados['valor'] ??= 0;
        $dados['ordem'] ??= (int) $registro->lancamentos()->where('grupo', $dados['grupo'])->max('ordem') + 1;

        $novo = $registro->lancamentos()->make($dados);
        // Gasto fixo e assinatura já nascem com o Real preenchido (igual ao valor)
        if (! array_key_exists('real', $dados) && $novo->ehGastoFixo()) {
            $novo->real = $novo->valor;
        }
        $novo->save();
        Historico::registrar($novo, 'criou', ['depois' => Historico::texto($novo->valor)]);

        return response()->json($novo, 201);
    }

    public function update(Request $request, Lancamento $lancamento)
    {
        $this->autorizar($request, $lancamento);

        return $this->lancamentos->atualizar($lancamento, $request->validate($this->regras(false)));
    }

    /**
     * Atualiza vários itens de uma vez (ex.: "Real = previsto") num único lote do histórico,
     * para que um só "desfazer" reverta tudo.
     */
    public function lote(Request $request, Auditoria $auditoria)
    {
        $regras = collect($this->regras(false))->mapWithKeys(fn ($r, $campo) => ["itens.*.{$campo}" => $r])->all();
        $dados = $request->validate([
            'rotulo' => ['nullable', 'string', 'max:120'],
            'itens' => ['required', 'array', 'min:1', 'max:500'],
            'itens.*.id' => ['required', 'integer'],
        ] + $regras);

        $auditoria->definirRotulo($dados['rotulo'] ?? null);

        DB::transaction(function () use ($request, $dados) {
            foreach ($dados['itens'] as $campos) {
                $lancamento = Lancamento::findOrFail($campos['id']);
                $this->autorizar($request, $lancamento);
                $this->lancamentos->atualizar($lancamento, collect($campos)->except('id')->all());
            }
        });

        return response()->noContent();
    }

    public function destroy(Request $request, Lancamento $lancamento)
    {
        $this->autorizar($request, $lancamento);
        $this->lancamentos->excluir($lancamento);

        return response()->noContent();
    }

    /**
     * Aplica o tipo (fixo/parcelado/avulso) e as parcelas deste item aos meses seguintes que já existem:
     * ajusta as parcelas (2/3, 3/3...), traz o item para meses onde falta e tira depois da última parcela.
     */
    public function propagar(Request $request, Lancamento $lancamento)
    {
        $this->autorizar($request, $lancamento);
        // Parcelas valem o mesmo valor em todos os meses; fixo sem parcela mantém o valor de cada mês
        $comValor = (bool) ($request->validate(['valor' => ['sometimes', 'boolean']])['valor'] ?? $lancamento->parcela_total !== null);

        return $this->meses->propagar($request->user(), $lancamento, $comValor);
    }

    /** Recebe a lista de ids na nova ordem (arrastar e soltar) */
    public function reordenar(Request $request)
    {
        $ids = $request->validate(['ids' => ['required', 'array'], 'ids.*' => ['integer']])['ids'];

        $itens = Lancamento::whereIn('id', $ids)
            ->whereHas('mes', fn ($q) => $q->where('user_id', $request->user()->id))
            ->get()->keyBy('id');

        foreach ($ids as $posicao => $id) {
            $itens->get($id)?->update(['ordem' => $posicao + 1]);
        }

        return response()->noContent();
    }

    private function autorizar(Request $request, Lancamento $lancamento): void
    {
        abort_unless($lancamento->mes->user_id === $request->user()->id, 404);
    }

    private function regras(bool $criando): array
    {
        $req = $criando ? 'required' : 'sometimes';

        return [
            'grupo' => [$req, Rule::in(Lancamento::GRUPOS)],
            'nome' => [$req, 'string', 'max:255'],
            'valor' => ['sometimes', 'numeric'],
            'real' => ['sometimes', 'nullable', 'numeric'],
            'vencimento' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'pago' => ['sometimes', 'boolean'],
            'recorrente' => ['sometimes', 'boolean'],
            'essencial' => ['sometimes', 'boolean'],
            'variavel' => ['sometimes', 'boolean'],
            'parcela_atual' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'parcela_total' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'ordem' => ['sometimes', 'integer'],
        ];
    }
}
