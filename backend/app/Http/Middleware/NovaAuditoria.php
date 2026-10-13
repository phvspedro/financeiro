<?php

namespace App\Http\Middleware;

use App\Services\Auditoria;
use Closure;
use Illuminate\Http\Request;

/** Cada requisição da API é uma ação do usuário: começa um lote novo no histórico */
class NovaAuditoria
{
    public function handle(Request $request, Closure $next)
    {
        app(Auditoria::class)->reiniciar();

        return $next($request);
    }
}
