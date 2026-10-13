<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('historicos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mes_id')->constrained('meses')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            // sem FK: o histórico continua existindo depois que a linha é excluída
            $table->unsignedBigInteger('lancamento_id')->nullable();
            // criou | alterou | excluiu | importou
            $table->string('acao', 10);
            $table->string('grupo', 10)->nullable();
            $table->string('nome')->nullable();
            $table->string('campo', 20)->nullable();
            $table->string('antes')->nullable();
            $table->string('depois')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['mes_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('historicos');
    }
};
