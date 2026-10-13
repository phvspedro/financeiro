<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Lancamento extends Model
{
    public const GRUPOS = ['entrada', 'saida', 'cartao', 'pix'];

    protected $fillable = [
        'grupo', 'nome', 'valor', 'real', 'vencimento', 'pago', 'recorrente', 'essencial', 'variavel',
        'parcela_atual', 'parcela_total', 'ordem',
    ];

    protected function casts(): array
    {
        return [
            'valor' => 'float',
            'real' => 'float',
            'vencimento' => 'date:Y-m-d',
            'pago' => 'boolean',
            'recorrente' => 'boolean',
            'essencial' => 'boolean',
            'variavel' => 'boolean',
            'parcela_atual' => 'integer',
            'parcela_total' => 'integer',
            'ordem' => 'integer',
        ];
    }

    public function mes(): BelongsTo
    {
        return $this->belongsTo(Mes::class);
    }

    /** Parcelado com prazo (TV, remédio...): não é fixo e acaba na última parcela */
    public function ehParcelado(): bool
    {
        return ! $this->recorrente && $this->parcela_total;
    }

    /** Vencimento em texto 'Y-m-d' (ou null), como é guardado no histórico */
    public function vencimentoTexto(): ?string
    {
        return $this->vencimento?->format('Y-m-d');
    }

    /** O mesmo dia do vencimento em outro mês (dia 31 num mês de 30 dias vira 30) */
    public function vencimentoNoMes(Mes $mes): ?string
    {
        if (! $this->vencimento) {
            return null;
        }

        $primeiro = $mes->competencia->copy()->startOfMonth();

        return $primeiro->day(min($this->vencimento->day, $primeiro->daysInMonth))->format('Y-m-d');
    }

    /** "3/10" ou null */
    public function parcelaTexto(): ?string
    {
        return $this->parcela_total ? ($this->parcela_atual ?? 1).'/'.$this->parcela_total : null;
    }

    /** Gasto fixo do mês: repete todo mês com valor fixo (não conta o que repete mas varia) nos recorrentes do cartão ou PIX */
    public function ehGastoFixo(): bool
    {
        return $this->recorrente && ! $this->variavel && in_array($this->grupo, ['cartao', 'pix'], true);
    }

    /** Gasto que repete todo mês, mas o valor muda (gasolina, mercado, lanches): o valor é só uma estimativa */
    public function ehVariavel(): bool
    {
        return $this->recorrente && $this->variavel && in_array($this->grupo, ['cartao', 'pix'], true);
    }

    /**
     * Parcela deste item daqui a $meses meses. Retorna null se o parcelado já terá acabado;
     * fixo parcelado (ex.: seguro em 10x) recomeça em 1 ao renovar.
     *
     * @return array{parcela_atual: ?int, parcela_total: ?int}|null
     */
    public function projetar(int $meses): ?array
    {
        if (! $this->parcela_total) {
            return ['parcela_atual' => null, 'parcela_total' => null];
        }

        $atual = $this->parcela_atual ?? 1;

        if ($this->recorrente) {
            $nova = (($atual - 1 + $meses) % $this->parcela_total) + 1;
        } else {
            $nova = $atual + $meses;
            if ($nova > $this->parcela_total) {
                return null;
            }
        }

        return ['parcela_atual' => $nova, 'parcela_total' => $this->parcela_total];
    }
}
