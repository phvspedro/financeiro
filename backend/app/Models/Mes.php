<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Mes extends Model
{
    protected $table = 'meses';

    protected $fillable = ['user_id', 'competencia', 'observacao'];

    protected function casts(): array
    {
        return ['competencia' => 'date:Y-m-d'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public const NOMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

    /** Ex.: "outubro/2026" */
    public function rotulo(): string
    {
        return self::NOMES[$this->competencia->month - 1].'/'.$this->competencia->year;
    }

    public function historicos(): HasMany
    {
        return $this->hasMany(Historico::class)->latest('id');
    }

    public function anterior(): ?self
    {
        return self::where('user_id', $this->user_id)
            ->whereDate('competencia', '<', $this->competencia->toDateString())
            ->orderByDesc('competencia')
            ->first();
    }

    public function lancamentos(): HasMany
    {
        return $this->hasMany(Lancamento::class)->orderBy('ordem')->orderBy('id');
    }

    /**
     * Totais do mês, seguindo as mesmas regras da planilha:
     * - Total Cartão usa o valor previsto (a fatura já está comprometida)
     * - Total PIX usa o valor real (o que de fato saiu)
     */
    public function totais(): array
    {
        $l = $this->lancamentos;
        $soma = fn (string $grupo, string $campo) => round((float) $l->where('grupo', $grupo)->sum(fn ($i) => (float) $i->$campo), 2);

        $entradas = $soma('entrada', 'valor');
        $saidas = $soma('saida', 'valor');
        $cartao = $soma('cartao', 'valor');
        $pix = $soma('pix', 'real');
        $fixo = round((float) $l->where('grupo', 'entrada')->where('recorrente', true)->sum('valor'), 2);
        $gastosFixos = $l->filter(fn (Lancamento $i) => $i->ehGastoFixo());
        $totalFixo = round((float) $gastosFixos->sum('valor'), 2);
        $minimo = round((float) $gastosFixos->where('essencial', true)->sum('valor'), 2);
        $variaveis = round((float) $l->filter(fn (Lancamento $i) => $i->ehVariavel())->sum('valor'), 2);
        $parcelados = round((float) $l->filter(fn (Lancamento $i) => $i->grupo !== 'entrada' && $i->ehParcelado())->sum('valor'), 2);

        return [
            'entradas' => $entradas,
            'saidas' => $saidas,
            'final' => round($entradas - $saidas, 2),
            'cartao' => $cartao,
            'pix' => $pix,
            'custo' => round($cartao + $pix, 2),
            'salario_fixo' => $fixo,
            'salario_menos_custo' => round($fixo - $cartao - $pix, 2),
            'sobra' => round($entradas - $cartao - $pix, 2),
            'total_fixo' => $totalFixo,
            'cortavel' => round($totalFixo - $minimo, 2),
            'minimo' => $minimo,
            'parcelados' => $parcelados,
            'variaveis' => $variaveis,
        ];
    }
}
