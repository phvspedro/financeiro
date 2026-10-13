<?php

namespace Database\Seeders;

use App\Models\Mes;
use App\Models\User;
use Illuminate\Database\Seeder;

/** Dados iniciais importados da planilha de agosto/2024 */
class PlanilhaAgosto2024Seeder extends Seeder
{
    public function run(User $user): void
    {
        $mes = Mes::create(['user_id' => $user->id, 'competencia' => '2024-08-01']);

        // [nome, valor, recorrente]
        $saidas = [
            ['Cartão pedro', 280], ['PicPay', 0], ['Elisa', 0], ['Cartão C6 (Mercado)', 1600],
            ['Condominio', 356], ['Luz', 180], ['Gas', 107.72], ['Mei', 0], ['Tim pedro', 69.99],
            ['Plano de saude', 1234], ['cabelo pedro', 60], ['Internet', 99.99],
            ['reserva financeira', 0], ['carro', 2000], ['cartão porto (seguro)', 3900],
            ['viagem 2027', 130], ['viagem casamento', 0],
        ];

        $entradas = [
            ['WEBDEC', 9500, true], ['EXTRA WEBDEC', 1234, false], ['EXTRA', 0, false],
            ['ELISA IGREJA', 0, true], ['ELISA CLINICA', 0, true], ['ELISA ONLINE', 0, true],
        ];

        // [nome, valor previsto, real]
        $cartao = [
            ['nuvem google Pedro', 14.99, 14.99], ['nuvem apple Pedro', 30, 30], ['primevideo', 20, 20],
            ['mercado livre', 24.90, 24.90], ['PS5', 80, 74.90], ['apple', 19.90, 19.90],
            ['netflix', 59.90, 59.90], ['petlove + xico', 105, 104.90], ['academia', 280, 278.19],
            ['gasolina(540) + esacionamento(60)', 480, 480], ['cartao seguro', 15, 14.90],
            ['seguro carro', 383, 383], ['manutenção carro', 550, 541.86], ['servidor+email', 47.29, 47.29],
            ['parcelas mês', 500, 500], ['compras de roupa', 650, 650], ['aniversario da Elisa', 450, 450],
            ['aniversario mãe', 300, 300], ['margem', 300, 300],
        ];

        $pix = [
            ['mercado', 1600, 1600], ['cabelo', 55, 55], ['condominio', 390, 390], ['luz', 190, 190],
            ['gas', 120, 120], ['mei', 85, 85], ['tim', 75, 75], ['internet', 100, 100],
            ['carro', 2025, 2025], ['manutenção carro', 0, 0], ['viagem carnaval', 150, 150],
            ['IPVA', 350, 350], ['viagem casamento', 300, null], ['lazer + comprinhas', 600, null],
            ['manutenção casa', 100, null], ['antecipar financiamento', 800, null], ['reserva', 500, null],
        ];

        // Fixos que não dá pra cortar (entram no "mínimo possível")
        $essenciais = [
            'gasolina(540) + esacionamento(60)', 'seguro carro', 'servidor+email', 'cartao seguro',
            'mercado', 'condominio', 'luz', 'gas', 'mei', 'tim', 'internet', 'carro', 'IPVA',
        ];

        // Gastos pontuais: não se repetem todo mês
        $pontuais = ['aniversario da Elisa', 'aniversario mãe', 'viagem carnaval', 'viagem casamento'];

        $ordem = 0;
        foreach ($saidas as [$nome, $valor]) {
            $mes->lancamentos()->create(['grupo' => 'saida', 'nome' => $nome, 'valor' => $valor, 'recorrente' => true, 'ordem' => ++$ordem]);
        }
        foreach ($entradas as [$nome, $valor, $fixo]) {
            $mes->lancamentos()->create(['grupo' => 'entrada', 'nome' => $nome, 'valor' => $valor, 'recorrente' => $fixo, 'pago' => $valor > 0, 'ordem' => ++$ordem]);
        }
        foreach (['cartao' => $cartao, 'pix' => $pix] as $grupo => $itens) {
            foreach ($itens as [$nome, $valor, $real]) {
                $mes->lancamentos()->create(['grupo' => $grupo, 'nome' => $nome, 'valor' => $valor, 'real' => $real, 'recorrente' => ! in_array($nome, $pontuais, true), 'essencial' => in_array($nome, $essenciais, true), 'ordem' => ++$ordem]);
            }
        }
    }
}
