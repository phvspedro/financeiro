<?php

namespace Tests\Feature;

use App\Models\Lancamento;
use App\Models\Mes;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MoverGrupoTest extends TestCase
{
    use RefreshDatabase;

    private Mes $outubro;

    private Mes $novembro;

    protected function setUp(): void
    {
        parent::setUp();
        $user = User::create(['name' => 'T', 'email' => 't@t.com', 'password' => 'x']);
        Sanctum::actingAs($user);
        $this->outubro = Mes::create(['user_id' => $user->id, 'competencia' => '2026-10-01']);
        $this->novembro = Mes::create(['user_id' => $user->id, 'competencia' => '2026-11-01']);
    }

    private function item(Mes $mes, array $dados = []): Lancamento
    {
        return $mes->lancamentos()->create($dados + ['grupo' => 'cartao', 'nome' => 'netflix', 'valor' => 59.90, 'recorrente' => true, 'ordem' => 1]);
    }

    public function test_move_do_cartao_para_o_pix_no_fim_da_lista_e_desfaz(): void
    {
        $this->item($this->outubro, ['grupo' => 'pix', 'nome' => 'aluguel', 'ordem' => 7]);
        $item = $this->item($this->outubro);

        $this->patchJson("/api/lancamentos/{$item->id}", ['grupo' => 'pix'])->assertOk();
        $item->refresh();
        $this->assertSame('pix', $item->grupo);
        $this->assertSame(8, $item->ordem);

        $this->postJson('/api/meses/2026/10/desfazer')->assertOk();
        $this->assertSame('cartao', $item->fresh()->grupo);
    }

    public function test_so_move_entre_cartao_e_pix(): void
    {
        $saida = $this->item($this->outubro, ['grupo' => 'saida', 'recorrente' => false]);
        $this->patchJson("/api/lancamentos/{$saida->id}", ['grupo' => 'pix'])->assertStatus(422);

        $cartao = $this->item($this->outubro);
        $this->patchJson("/api/lancamentos/{$cartao->id}", ['grupo' => 'entrada'])->assertStatus(422);
        $this->assertSame('cartao', $cartao->fresh()->grupo);
    }

    public function test_propagar_leva_o_item_dos_meses_seguintes_para_o_novo_grupo_sem_duplicar(): void
    {
        $item = $this->item($this->outubro);
        $futuro = $this->item($this->novembro);

        $this->patchJson("/api/lancamentos/{$item->id}", ['grupo' => 'pix'])->assertOk();
        $this->postJson("/api/lancamentos/{$item->id}/propagar", ['grupo_anterior' => 'cartao'])->assertOk();

        $this->assertSame('pix', $futuro->fresh()->grupo);
        $this->assertSame(1, $this->novembro->lancamentos()->where('nome', 'netflix')->count());
    }
}
