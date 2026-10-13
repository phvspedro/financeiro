<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lancamentos', function (Blueprint $table) {
            // Repete todo mês, mas o valor varia (gasolina, mercado, lanches). Só vale com recorrente = true.
            $table->boolean('variavel')->default(false)->after('essencial');
        });
    }

    public function down(): void
    {
        Schema::table('lancamentos', function (Blueprint $table) {
            $table->dropColumn('variavel');
        });
    }
};
