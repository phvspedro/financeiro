<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('historicos', function (Blueprint $table) {
            // Todas as linhas geradas por uma mesma ação do usuário compartilham o lote
            $table->uuid('lote')->nullable()->index()->after('mes_id');
            $table->string('rotulo')->nullable()->after('lote');
            // Foto do item (exclusões) ou detalhes (replicação), para restaurar/mostrar
            $table->json('dados')->nullable();
            // Lote que desfez este (preenchido quando a ação foi desfeita)
            $table->uuid('desfeito_por')->nullable()->index();
            // Quando o lote é um "desfazer", aponta para o lote desfeito
            $table->uuid('reverte_lote')->nullable();
            // Ação feita pelo sistema (ex.: mês aberto pela 1ª vez): fora do Ctrl+Z
            $table->boolean('automatico')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('historicos', function (Blueprint $table) {
            $table->dropColumn(['lote', 'rotulo', 'dados', 'desfeito_por', 'reverte_lote', 'automatico']);
        });
    }
};
