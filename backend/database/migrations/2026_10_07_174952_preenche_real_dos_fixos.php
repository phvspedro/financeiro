<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Gastos fixos e assinaturas (cartão e PIX) já têm o Real preenchido, igual ao valor.
     * Preenche os que estavam em branco do mês atual em diante; meses passados são histórico e não são
     * reescritos, e o que o usuário já lançou não é tocado.
     */
    public function up(): void
    {
        $meses = DB::table('meses')->where('competencia', '>=', Carbon::now()->startOfMonth()->toDateString())->select('id');

        DB::table('lancamentos')
            ->whereIn('mes_id', $meses)
            ->whereIn('grupo', ['cartao', 'pix'])
            ->where('recorrente', true)
            ->where('variavel', false)
            ->whereNull('real')
            ->update(['real' => DB::raw('valor')]);
    }

    public function down(): void
    {
        // Não há como saber quais já estavam em branco antes.
    }
};
