<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lancamentos', function (Blueprint $table) {
            // Gasto fixo que não pode ser cortado (entra no "mínimo possível")
            $table->boolean('essencial')->default(false)->after('recorrente');
        });
    }

    public function down(): void
    {
        Schema::table('lancamentos', function (Blueprint $table) {
            $table->dropColumn('essencial');
        });
    }
};
