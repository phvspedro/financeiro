<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('auth:revogar', function () {
    $total = \Laravel\Sanctum\PersonalAccessToken::query()->delete();

    $this->info("{$total} sessão(ões) revogada(s). Todos precisarão entrar novamente.");
})->purpose('Revoga todos os logins (inclusive os "lembrar-me" permanentes)');
