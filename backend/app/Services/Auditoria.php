<?php

namespace App\Services;

use Illuminate\Support\Str;

/**
 * Agrupa as linhas de histórico de uma mesma ação do usuário em um "lote".
 * É registrado como scoped: cada requisição HTTP tem o seu.
 */
class Auditoria
{
    private ?string $lote = null;

    private ?string $rotulo = null;

    private bool $automatico = false;

    public function reiniciar(): void
    {
        [$this->lote, $this->rotulo, $this->automatico] = [null, null, false];
    }

    public function lote(): string
    {
        return $this->lote ??= (string) Str::uuid();
    }

    public function rotulo(): ?string
    {
        return $this->rotulo;
    }

    public function automatico(): bool
    {
        return $this->automatico;
    }

    public function definirRotulo(?string $rotulo): void
    {
        $this->rotulo = $rotulo;
    }

    /** Executa $fn num lote próprio, sem misturar com o da requisição */
    public function comLote(?string $rotulo, callable $fn, bool $automatico = false): mixed
    {
        [$lote, $r, $a] = [$this->lote, $this->rotulo, $this->automatico];
        [$this->lote, $this->rotulo, $this->automatico] = [(string) Str::uuid(), $rotulo, $automatico];

        try {
            return $fn();
        } finally {
            [$this->lote, $this->rotulo, $this->automatico] = [$lote, $r, $a];
        }
    }
}
