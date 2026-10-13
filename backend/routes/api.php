<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\HistoricoController;
use App\Http\Controllers\Api\LancamentoController;
use App\Http\Controllers\Api\MesController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:10,1');

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);

    Route::get('/anual/{ano}', [MesController::class, 'anual'])->whereNumber('ano');
    Route::get('/meses', [MesController::class, 'existentes']);
    Route::post('/historico/{lote}/desfazer', [HistoricoController::class, 'desfazerLote'])->whereUuid('lote');

    Route::prefix('/meses/{ano}/{mes}')->whereNumber(['ano', 'mes'])->group(function () {
        Route::get('/', [MesController::class, 'show']);
        Route::patch('/', [MesController::class, 'update']);
        Route::post('/importar-fixos', [MesController::class, 'importarFixos']);
        Route::post('/replicar', [MesController::class, 'replicar']);
        Route::get('/historico', [MesController::class, 'historico']);
        Route::get('/pilha', [HistoricoController::class, 'pilha']);
        Route::post('/desfazer', [HistoricoController::class, 'desfazerUltima']);
        Route::post('/refazer', [HistoricoController::class, 'refazer']);
        Route::post('/voltar-ate', [HistoricoController::class, 'voltarAte']);
        Route::post('/lancamentos', [LancamentoController::class, 'store']);
    });

    Route::post('/lancamentos/{lancamento}/propagar', [LancamentoController::class, 'propagar']);
    Route::post('/lancamentos/lote', [LancamentoController::class, 'lote']);
    Route::post('/lancamentos/reordenar', [LancamentoController::class, 'reordenar']);
    Route::patch('/lancamentos/{lancamento}', [LancamentoController::class, 'update']);
    Route::delete('/lancamentos/{lancamento}', [LancamentoController::class, 'destroy']);
});
