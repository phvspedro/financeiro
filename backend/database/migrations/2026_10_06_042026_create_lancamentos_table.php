<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lancamentos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mes_id')->constrained('meses')->cascadeOnDelete();
            // entrada | saida | cartao | pix
            $table->string('grupo', 10);
            $table->string('nome');
            $table->decimal('valor', 12, 2)->default(0);
            $table->decimal('real', 12, 2)->nullable();
            $table->boolean('pago')->default(false);
            $table->boolean('recorrente')->default(false);
            $table->unsignedSmallInteger('parcela_atual')->nullable();
            $table->unsignedSmallInteger('parcela_total')->nullable();
            $table->unsignedInteger('ordem')->default(0);
            $table->timestamps();

            $table->index(['mes_id', 'grupo', 'ordem']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lancamentos');
    }
};
