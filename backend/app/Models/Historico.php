<?php

namespace App\Models;

use App\Services\Auditoria;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Collection;

class Historico extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'mes_id', 'user_id', 'lancamento_id', 'acao', 'grupo', 'nome', 'campo', 'antes', 'depois',
        'lote', 'rotulo', 'dados', 'desfeito_por', 'reverte_lote', 'automatico',
    ];

    protected function casts(): array
    {
        return ['dados' => 'array', 'automatico' => 'boolean'];
    }

    public function mes(): BelongsTo
    {
        return $this->belongsTo(Mes::class);
    }

    /** Campos acompanhados no histórico (parcela_atual/total viram "parcela") */
    public const CAMPOS = ['nome', 'valor', 'real', 'vencimento', 'pago', 'recorrente', 'essencial', 'variavel', 'parcela'];

    /** Registra uma linha no lote da requisição em andamento */
    public static function registrar(Lancamento $l, string $acao, array $extra = []): self
    {
        $auditoria = app(Auditoria::class);

        return self::create(array_merge([
            'mes_id' => $l->mes_id,
            'user_id' => auth()->id(),
            'lancamento_id' => $l->id,
            'acao' => $acao,
            'grupo' => $l->grupo,
            'nome' => $l->nome,
            'lote' => $auditoria->lote(),
            'rotulo' => $auditoria->rotulo(),
            'automatico' => $auditoria->automatico(),
        ], $extra));
    }

    /** Texto curto que resume o que um lote fez (usado em dicas e mensagens) */
    public static function descreverLote(Collection $linhas): string
    {
        $primeira = $linhas->sortBy('id')->first();
        if ($primeira?->rotulo) {
            return $primeira->rotulo;
        }

        $acionaveis = $linhas->whereIn('acao', ['criou', 'alterou', 'excluiu']);
        $itens = $acionaveis->pluck('lancamento_id')->unique();
        if ($itens->count() !== 1) {
            return $acionaveis->count().' alterações';
        }

        $l = $acionaveis->sortBy('id')->first();
        $nome = $l->nome;

        return match ($l->acao) {
            'criou' => "Adicionou {$nome}",
            'excluiu' => "Excluiu {$nome}",
            default => $acionaveis->count() > 1 || ! in_array($l->campo, ['valor', 'real', 'vencimento', 'pago', 'nome'], true)
                ? "Alterou {$nome}"
                : match ($l->campo) {
                    'valor' => "Valor de {$nome}",
                    'vencimento' => "Vencimento de {$nome}",
                    'real' => "Real de {$nome}",
                    'pago' => ($l->grupo === 'entrada' ? 'Recebido: ' : 'Pago: ').$nome,
                    default => "Renomeou {$nome}",
                },
        };
    }

    /** Representação em texto de um valor para guardar no histórico */
    public static function texto(mixed $v): ?string
    {
        return match (true) {
            $v === null => null,
            is_bool($v) => $v ? '1' : '0',
            default => (string) $v,
        };
    }
}
