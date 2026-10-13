<?php

namespace Tests\Feature;

use App\Models\Historico;
use App\Models\Lancamento;
use App\Models\Mes;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DesfazerTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Mes $outubro;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::create(['name' => 'T', 'email' => 't@t.com', 'password' => 'x']);
        Sanctum::actingAs($this->user);
        $this->outubro = Mes::create(['user_id' => $this->user->id, 'competencia' => '2026-10-01']);
    }

    private function item(array $dados = []): Lancamento
    {
        return $this->outubro->lancamentos()->create($dados + ['grupo' => 'cartao', 'nome' => 'netflix', 'valor' => 59.90, 'recorrente' => true]);
    }

    private function ultimoLote(): string
    {
        return Historico::whereNull('reverte_lote')->latest('id')->firstOrFail()->lote;
    }

    public function test_desfaz_e_refaz_alteracao_de_valor(): void
    {
        $item = $this->item();
        $this->patchJson("/api/lancamentos/{$item->id}", ['valor' => 64.90])->assertOk();

        $this->postJson('/api/meses/2026/10/desfazer')->assertOk();
        $this->assertEquals(59.90, $item->fresh()->valor);

        $pilha = $this->getJson('/api/meses/2026/10/pilha')->json();
        $this->assertNull($pilha['desfazer']);
        $this->assertNotNull($pilha['refazer']);

        $this->postJson('/api/meses/2026/10/refazer')->assertOk();
        $this->assertEquals(64.90, $item->fresh()->valor);
        $this->assertNull($this->getJson('/api/meses/2026/10/pilha')->json('refazer'));
        $this->assertNotNull($this->getJson('/api/meses/2026/10/pilha')->json('desfazer'));
    }

    public function test_acao_nova_limpa_o_refazer(): void
    {
        $item = $this->item();
        $this->patchJson("/api/lancamentos/{$item->id}", ['valor' => 70])->assertOk();
        $this->postJson('/api/meses/2026/10/desfazer')->assertOk();
        $this->patchJson("/api/lancamentos/{$item->id}", ['pago' => true])->assertOk();

        $this->assertNull($this->getJson('/api/meses/2026/10/pilha')->json('refazer'));
        $this->postJson('/api/meses/2026/10/refazer')->assertStatus(422);
    }

    public function test_desfaz_exclusao_restaurando_o_mesmo_item(): void
    {
        $item = $this->item(['real' => 59.90, 'pago' => true, 'parcela_atual' => 2, 'parcela_total' => 10]);
        $id = $item->id;
        $this->deleteJson("/api/lancamentos/{$id}")->assertNoContent();
        $this->assertNull(Lancamento::find($id));

        $this->postJson('/api/meses/2026/10/desfazer')->assertOk();

        $volta = Lancamento::findOrFail($id);
        $this->assertSame('netflix', $volta->nome);
        $this->assertEquals(59.90, $volta->real);
        $this->assertTrue($volta->pago);
        $this->assertSame('2/10', $volta->parcelaTexto());

        // refazer = excluir de novo
        $this->postJson('/api/meses/2026/10/refazer')->assertOk();
        $this->assertNull(Lancamento::find($id));
    }

    public function test_desfaz_criacao(): void
    {
        $id = $this->postJson('/api/meses/2026/10/lancamentos', ['grupo' => 'saida', 'nome' => 'Farmácia', 'valor' => 87.5])->assertCreated()->json('id');

        $this->postJson('/api/meses/2026/10/desfazer')->assertOk();
        $this->assertNull(Lancamento::find($id));

        $this->postJson('/api/meses/2026/10/refazer')->assertOk();
        $this->assertSame('Farmácia', Lancamento::findOrFail($id)->nome);
    }

    public function test_real_igual_previsto_em_lote_e_um_unico_desfazer(): void
    {
        $a = $this->item(['nome' => 'a', 'valor' => 10]);
        $b = $this->item(['nome' => 'b', 'valor' => 20]);
        $c = $this->item(['nome' => 'c', 'valor' => 30]);

        $this->postJson('/api/lancamentos/lote', [
            'rotulo' => 'Real = previsto · Cartão',
            'itens' => [['id' => $a->id, 'real' => 10], ['id' => $b->id, 'real' => 20], ['id' => $c->id, 'real' => 30]],
        ])->assertNoContent();

        $this->assertEquals(60, Lancamento::sum('real'));
        $this->assertSame('Real = previsto · Cartão', $this->getJson('/api/meses/2026/10/pilha')->json('desfazer.descricao'));
        $this->assertSame(3, $this->getJson('/api/meses/2026/10/pilha')->json('desfazer.itens'));

        $this->postJson('/api/meses/2026/10/desfazer')->assertOk();
        $this->assertNull(Lancamento::whereNotNull('real')->first());
    }

    public function test_nao_desfaz_quando_o_item_mudou_depois(): void
    {
        $item = $this->item();
        $this->patchJson("/api/lancamentos/{$item->id}", ['valor' => 70])->assertOk();
        $primeiro = $this->ultimoLote();
        $this->patchJson("/api/lancamentos/{$item->id}", ['valor' => 80])->assertOk();

        $this->postJson("/api/historico/{$primeiro}/desfazer")->assertStatus(409)->assertJsonPath('message', fn ($m) => str_contains($m, 'foi alterado depois'));
        $this->assertEquals(80, $item->fresh()->valor);
    }

    public function test_desfazer_independente_funciona_em_campos_diferentes(): void
    {
        $item = $this->item();
        $this->patchJson("/api/lancamentos/{$item->id}", ['valor' => 70])->assertOk();
        $valor = $this->ultimoLote();
        $this->patchJson("/api/lancamentos/{$item->id}", ['pago' => true])->assertOk();

        $this->postJson("/api/historico/{$valor}/desfazer")->assertOk();
        $item->refresh();
        $this->assertEquals(59.90, $item->valor);
        $this->assertTrue($item->pago, 'a ação mais nova não deve ser desfeita');
    }

    public function test_nao_desfaz_criacao_de_item_alterado_depois(): void
    {
        $id = $this->postJson('/api/meses/2026/10/lancamentos', ['grupo' => 'saida', 'nome' => 'Luz', 'valor' => 100])->json('id');
        $criacao = $this->ultimoLote();
        $this->patchJson("/api/lancamentos/{$id}", ['valor' => 120])->assertOk();

        $this->postJson("/api/historico/{$criacao}/desfazer")->assertStatus(409);
        $this->assertNotNull(Lancamento::find($id));

        // desfazendo a alteração primeiro, a criação pode ser desfeita
        $this->postJson('/api/meses/2026/10/desfazer')->assertOk();
        $this->postJson("/api/historico/{$criacao}/desfazer")->assertOk();
        $this->assertNull(Lancamento::find($id));
    }

    public function test_mesma_acao_nao_pode_ser_desfeita_duas_vezes(): void
    {
        $item = $this->item();
        $this->deleteJson("/api/lancamentos/{$item->id}")->assertNoContent();
        $lote = $this->ultimoLote();

        $this->postJson("/api/historico/{$lote}/desfazer")->assertOk();
        $this->postJson("/api/historico/{$lote}/desfazer")->assertStatus(409);
        $this->assertSame(1, Lancamento::count(), 'não pode duplicar o item restaurado');
    }

    public function test_voltar_ate_desfaz_tudo_que_veio_depois(): void
    {
        $item = $this->item();
        $this->patchJson("/api/lancamentos/{$item->id}", ['valor' => 70])->assertOk();
        $ponto = $this->ultimoLote();
        $this->patchJson("/api/lancamentos/{$item->id}", ['valor' => 80])->assertOk();
        $this->patchJson("/api/lancamentos/{$item->id}", ['pago' => true])->assertOk();
        $this->postJson('/api/meses/2026/10/lancamentos', ['grupo' => 'pix', 'nome' => 'novo', 'valor' => 5])->assertCreated();

        $this->postJson('/api/meses/2026/10/voltar-ate', ['lote' => $ponto])->assertOk()->assertJsonPath('desfeitas', 3);

        $item->refresh();
        $this->assertEquals(70, $item->valor);
        $this->assertFalse($item->pago);
        $this->assertSame(1, Lancamento::count());
    }

    public function test_acoes_automaticas_ficam_fora_do_ctrl_z(): void
    {
        $setembro = Mes::create(['user_id' => $this->user->id, 'competencia' => '2026-09-01']);
        $setembro->lancamentos()->create(['grupo' => 'cartao', 'nome' => 'netflix', 'valor' => 50, 'recorrente' => true]);

        $this->getJson('/api/meses/2026/10')->assertOk();   // outubro já existe, não importa nada
        $this->getJson('/api/meses/2026/11')->assertOk();   // novembro é criado e importa de outubro (vazio) 
        $outubro = $this->outubro->fresh();

        $this->item(['nome' => 'x']);
        $this->getJson('/api/meses/2026/12')->assertOk();

        $linhas = Historico::where('automatico', true)->get();
        $this->assertTrue($linhas->every(fn ($l) => $l->rotulo !== null));
        $this->assertNull($this->getJson('/api/meses/2026/12/pilha')->json('desfazer'), 'mês recém-criado não tem o que desfazer');
        $this->assertNotNull($outubro);
    }

    public function test_replicar_ajusta_parcelas_e_nao_duplica(): void
    {
        $this->item(['nome' => 'condominio', 'valor' => 390, 'grupo' => 'pix']);
        $this->item(['nome' => 'seguro', 'valor' => 383, 'parcela_atual' => 9, 'parcela_total' => 10]);                          // fixo parcelado: 10/10 e depois renova
        $this->item(['nome' => 'TV', 'valor' => 250, 'recorrente' => false, 'parcela_atual' => 9, 'parcela_total' => 10]);        // parcelado: acaba
        $this->item(['nome' => 'presente', 'valor' => 100, 'recorrente' => false]);                                              // avulso
        $this->item(['nome' => 'salario', 'grupo' => 'entrada', 'valor' => 9500]);

        // novembro já tem um "condominio" (não pode duplicar)
        $nov = Mes::create(['user_id' => $this->user->id, 'competencia' => '2026-11-01']);
        $nov->lancamentos()->create(['grupo' => 'pix', 'nome' => 'Condominio', 'valor' => 111, 'recorrente' => true]);

        $r = $this->postJson('/api/meses/2026/10/replicar', ['meses' => ['2026-11', '2026-12', '2027-01'], 'modo' => 'fixos'])->assertOk();
        $r->assertJsonPath('criados', 9)   // nov: seguro, TV, salario (condominio já existe) | dez: cond, seguro, salario | jan: cond, seguro, salario
            ->assertJsonPath('meses', ['novembro/2026', 'dezembro/2026', 'janeiro/2027']);

        $dados = fn (string $c) => Mes::whereDate('competencia', $c)->first()->lancamentos->keyBy('nome');

        $n = $dados('2026-11-01');
        $this->assertCount(1, $n->filter(fn ($l) => strtolower($l->nome) === 'condominio'), 'não duplica');
        $this->assertEquals(111, $n['Condominio']->valor, 'valor existente é mantido');
        $this->assertSame('10/10', $n['seguro']->parcelaTexto());
        $this->assertSame('10/10', $n['TV']->parcelaTexto());
        $this->assertFalse($n->has('presente'), 'avulso não vai no modo só-fixos');
        $this->assertEquals(383, $n['seguro']->real, 'fixo já vem com o Real preenchido');
        $this->assertNull($n['TV']->real, 'parcelado fica em aberto');

        $d = $dados('2026-12-01');
        $this->assertSame('1/10', $d['seguro']->parcelaTexto(), 'fixo parcelado renova');
        $this->assertFalse($d->has('TV'), 'parcelado terminou');

        $j = $dados('2027-01-01');
        $this->assertSame('2/10', $j['seguro']->parcelaTexto());
        $this->assertTrue($j->has('condominio'));
    }

    public function test_replicar_tudo_e_atualizar_valores(): void
    {
        $this->item(['nome' => 'presente', 'valor' => 100, 'recorrente' => false]);
        $this->item(['nome' => 'netflix', 'valor' => 64.90]);
        $nov = Mes::create(['user_id' => $this->user->id, 'competencia' => '2026-11-01']);
        $nov->lancamentos()->create(['grupo' => 'cartao', 'nome' => 'netflix', 'valor' => 59.90, 'recorrente' => true]);

        $this->postJson('/api/meses/2026/10/replicar', ['meses' => ['2026-11'], 'modo' => 'tudo', 'atualizar' => true])
            ->assertOk()->assertJsonPath('criados', 1)->assertJsonPath('atualizados', 1);

        $this->assertEquals(64.90, $nov->lancamentos()->where('nome', 'netflix')->first()->valor);
        $this->assertTrue($nov->lancamentos()->where('nome', 'presente')->exists());
    }

    public function test_replicar_rejeita_mes_passado(): void
    {
        $this->postJson('/api/meses/2026/10/replicar', ['meses' => ['2026-09']])->assertStatus(422);
        $this->postJson('/api/meses/2026/10/replicar', ['meses' => ['2026-10']])->assertStatus(422);
        $this->postJson('/api/meses/2026/10/replicar', ['meses' => ['lixo']])->assertStatus(422);
    }

    public function test_desfazer_replicacao_remove_tudo_e_refazer_traz_de_volta(): void
    {
        $this->item(['nome' => 'a', 'valor' => 1]);
        $this->item(['nome' => 'b', 'valor' => 2]);

        $this->postJson('/api/meses/2026/10/replicar', ['meses' => ['2026-11', '2026-12']])->assertOk()->assertJsonPath('criados', 4);
        $this->assertSame(6, Lancamento::count());

        // aparece (e é desfeito) pelo histórico de outubro, a origem
        $this->assertStringStartsWith('Replicou outubro/2026', $this->getJson('/api/meses/2026/10/pilha')->json('desfazer.descricao'));
        $this->postJson('/api/meses/2026/10/desfazer')->assertOk()->assertJsonPath('meses', 2);
        $this->assertSame(2, Lancamento::count());

        $this->postJson('/api/meses/2026/10/refazer')->assertOk();
        $this->assertSame(6, Lancamento::count());
    }

    public function test_nao_mexe_no_historico_de_outro_usuario(): void
    {
        $item = $this->item();
        $this->patchJson("/api/lancamentos/{$item->id}", ['valor' => 70])->assertOk();
        $lote = $this->ultimoLote();

        Sanctum::actingAs(User::create(['name' => 'O', 'email' => 'o@o.com', 'password' => 'x']));
        $this->postJson("/api/historico/{$lote}/desfazer")->assertNotFound();
        $this->assertEquals(70, $item->fresh()->valor);
    }

    public function test_vencimento_e_validado_salvo_e_desfeito(): void
    {
        $item = $this->item(['grupo' => 'saida', 'nome' => 'Luz']);

        $this->patchJson("/api/lancamentos/{$item->id}", ['vencimento' => '2026-10-15'])->assertOk()->assertJsonPath('vencimento', '2026-10-15');
        $this->patchJson("/api/lancamentos/{$item->id}", ['vencimento' => '31/10'])->assertStatus(422);
        $this->patchJson("/api/lancamentos/{$item->id}", ['vencimento' => '2026-02-31'])->assertStatus(422);

        $this->assertSame('Vencimento de Luz', $this->getJson('/api/meses/2026/10/pilha')->json('desfazer.descricao'));
        $this->postJson('/api/meses/2026/10/desfazer')->assertOk();
        $this->assertNull($item->fresh()->vencimento);

        $this->postJson('/api/meses/2026/10/refazer')->assertOk();
        $this->assertSame('2026-10-15', $item->fresh()->vencimentoTexto());

        // limpar a data também é uma alteração que se desfaz
        $this->patchJson("/api/lancamentos/{$item->id}", ['vencimento' => null])->assertOk();
        $this->assertNull($item->fresh()->vencimento);
        $this->postJson('/api/meses/2026/10/desfazer')->assertOk();
        $this->assertSame('2026-10-15', $item->fresh()->vencimentoTexto());
    }

    public function test_exclusao_desfeita_restaura_o_vencimento(): void
    {
        $item = $this->item(['grupo' => 'saida', 'nome' => 'Luz', 'vencimento' => '2026-10-15']);
        $this->deleteJson("/api/lancamentos/{$item->id}")->assertNoContent();
        $this->postJson('/api/meses/2026/10/desfazer')->assertOk();

        $this->assertSame('2026-10-15', Lancamento::findOrFail($item->id)->vencimentoTexto());
    }

    public function test_replicar_leva_o_dia_do_vencimento_para_cada_mes(): void
    {
        $this->item(['grupo' => 'saida', 'nome' => 'Condominio', 'vencimento' => '2026-10-31']);
        $this->item(['grupo' => 'saida', 'nome' => 'Luz', 'vencimento' => '2026-10-10']);
        $this->item(['grupo' => 'saida', 'nome' => 'Sem data']);

        $this->postJson('/api/meses/2026/10/replicar', ['meses' => ['2026-11', '2026-12', '2027-02']])->assertOk();

        $venc = fn (string $competencia, string $nome) => Mes::whereDate('competencia', $competencia)->first()->lancamentos->firstWhere('nome', $nome)->vencimentoTexto();

        $this->assertSame('2026-11-30', $venc('2026-11-01', 'Condominio'), 'dia 31 vira 30 em novembro');
        $this->assertSame('2026-12-31', $venc('2026-12-01', 'Condominio'));
        $this->assertSame('2027-02-28', $venc('2027-02-01', 'Condominio'), 'e 28 em fevereiro');
        $this->assertSame('2027-02-10', $venc('2027-02-01', 'Luz'));
        $this->assertNull($venc('2026-11-01', 'Sem data'));
    }

    public function test_abrir_mes_novo_traz_o_vencimento_do_mes_anterior(): void
    {
        $this->item(['grupo' => 'saida', 'nome' => 'Luz', 'vencimento' => '2026-10-10']);

        $r = $this->getJson('/api/meses/2026/11')->assertOk();
        $this->assertSame('2026-11-10', $r->json('lancamentos.0.vencimento'));
    }

    public function test_replicar_por_padrao_copia_o_mes_inteiro_inclusive_avulsos(): void
    {
        $this->item(['nome' => 'presente', 'valor' => 100, 'recorrente' => false, 'real' => 90, 'pago' => true]);
        $this->item(['nome' => 'netflix', 'valor' => 60, 'real' => 60, 'pago' => true]);

        $this->postJson('/api/meses/2026/10/replicar', ['meses' => ['2026-11']])->assertOk()->assertJsonPath('criados', 2);

        $nov = Mes::whereDate('competencia', '2026-11-01')->first()->lancamentos->keyBy('nome');
        $this->assertTrue($nov->has('presente'), 'avulso é copiado');
        $this->assertEquals(60, $nov['netflix']->real, 'fixo já vem com o Real preenchido (igual ao valor)');
        $this->assertNull($nov['presente']->real, 'avulso fica em aberto');
        $this->assertFalse($nov['netflix']->pago);
    }

    public function test_replicar_pode_copiar_tambem_real_e_pago(): void
    {
        $this->item(['nome' => 'netflix', 'valor' => 60, 'real' => 58, 'pago' => true]);

        $this->postJson('/api/meses/2026/10/replicar', ['meses' => ['2026-11'], 'estado' => true])->assertOk();

        $copia = Mes::whereDate('competencia', '2026-11-01')->first()->lancamentos->first();
        $this->assertEquals(58, $copia->real);
        $this->assertTrue($copia->pago);
    }

    /** Meses seguintes já existem com o item como fixo; depois o usuário o transforma em parcelado 1/3 */
    private function mesesComCopiaFixa(string $nome = 'manutenção carro'): void
    {
        $this->item(['nome' => $nome, 'valor' => 550]);
        foreach (['2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01'] as $c) {
            $mes = Mes::create(['user_id' => $this->user->id, 'competencia' => $c]);
            $mes->lancamentos()->create(['grupo' => 'cartao', 'nome' => $nome, 'valor' => 550, 'recorrente' => true]);
        }
    }

    private function noMes(string $competencia, string $nome = 'manutenção carro'): ?Lancamento
    {
        return Mes::whereDate('competencia', $competencia)->first()->lancamentos->first(fn ($l) => $l->nome === $nome);
    }

    public function test_propagar_ajusta_parcelas_nos_meses_que_ja_existem(): void
    {
        $this->mesesComCopiaFixa();
        $item = Lancamento::where('nome', 'manutenção carro')->where('mes_id', $this->outubro->id)->first();

        $this->patchJson("/api/lancamentos/{$item->id}", ['recorrente' => false, 'parcela_atual' => 1, 'parcela_total' => 3])->assertOk();
        $this->assertTrue($this->noMes('2026-11-01')->recorrente, 'mudar o tipo não mexe nos outros meses sozinho');

        $this->postJson("/api/lancamentos/{$item->id}/propagar")->assertOk()
            ->assertJsonPath('atualizados', 2)->assertJsonPath('removidos', 2)->assertJsonPath('criados', 0)->assertJsonPath('meses', 4);

        $nov = $this->noMes('2026-11-01');
        $this->assertSame('2/3', $nov->parcelaTexto());
        $this->assertFalse($nov->recorrente, 'deixa de ser fixo');
        $this->assertSame('3/3', $this->noMes('2026-12-01')->parcelaTexto());
        $this->assertNull($this->noMes('2027-01-01'), 'acabou em dezembro');
        $this->assertNull($this->noMes('2027-02-01'));
    }

    public function test_desfazer_a_propagacao_devolve_os_meses_como_estavam(): void
    {
        $this->mesesComCopiaFixa();
        $item = Lancamento::where('nome', 'manutenção carro')->where('mes_id', $this->outubro->id)->first();
        $this->patchJson("/api/lancamentos/{$item->id}", ['recorrente' => false, 'parcela_atual' => 1, 'parcela_total' => 3])->assertOk();
        $this->postJson("/api/lancamentos/{$item->id}/propagar")->assertOk();

        $this->assertStringStartsWith('Aplicou', $this->getJson('/api/meses/2026/10/pilha')->json('desfazer.descricao'));
        $this->postJson('/api/meses/2026/10/desfazer')->assertOk()->assertJsonPath('meses', 4);

        $this->assertTrue($this->noMes('2026-11-01')->recorrente);
        $this->assertNull($this->noMes('2026-11-01')->parcela_total);
        $this->assertNotNull($this->noMes('2027-02-01'), 'itens removidos voltam');

        $this->postJson('/api/meses/2026/10/refazer')->assertOk();
        $this->assertNull($this->noMes('2027-02-01'));
        $this->assertSame('3/3', $this->noMes('2026-12-01')->parcelaTexto());
    }

    public function test_propagar_cria_o_item_onde_falta_e_respeita_o_valor_opcional(): void
    {
        $item = $this->item(['nome' => 'TV', 'valor' => 250, 'recorrente' => false, 'parcela_atual' => 1, 'parcela_total' => 3]);
        $nov = Mes::create(['user_id' => $this->user->id, 'competencia' => '2026-11-01']);
        $dez = Mes::create(['user_id' => $this->user->id, 'competencia' => '2026-12-01']);
        $dez->lancamentos()->create(['grupo' => 'cartao', 'nome' => 'tv', 'valor' => 100, 'recorrente' => true]);

        $this->postJson("/api/lancamentos/{$item->id}/propagar")->assertOk()->assertJsonPath('criados', 1)->assertJsonPath('atualizados', 1);
        $this->assertSame('2/3', $nov->lancamentos()->first()->parcelaTexto());
        $this->assertEquals(250, $nov->lancamentos()->first()->valor, 'item criado leva o valor');
        $this->assertEquals(250, $dez->lancamentos()->first()->valor, 'parcelas valem o mesmo valor');
        $this->assertSame('3/3', $dez->lancamentos()->first()->parcelaTexto());

        // dá para pedir para não levar o valor
        $dez->lancamentos()->first()->update(['valor' => 100]);
        $this->postJson("/api/lancamentos/{$item->id}/propagar", ['valor' => false])->assertOk();
        $this->assertEquals(100, $dez->lancamentos()->first()->valor);
    }

    public function test_propagar_cria_os_meses_que_faltam_ate_a_ultima_parcela(): void
    {
        $item = $this->item(['nome' => 'Notebook', 'valor' => 375, 'recorrente' => false, 'parcela_atual' => 1, 'parcela_total' => 6]);
        $this->item(['nome' => 'netflix', 'valor' => 60]); // fixo: tem que vir junto nos meses novos
        $nov = Mes::create(['user_id' => $this->user->id, 'competencia' => '2026-11-01']);
        $nov->lancamentos()->create(['grupo' => 'cartao', 'nome' => 'netflix', 'valor' => 65, 'recorrente' => true]); // último mês, preço diferente

        $this->postJson("/api/lancamentos/{$item->id}/propagar")->assertOk()
            ->assertJsonPath('novos_meses', ['dezembro/2026', 'janeiro/2027', 'fevereiro/2027', 'março/2027'])
            ->assertJsonPath('meses', 5);

        $parcela = fn (string $c) => Mes::whereDate('competencia', $c)->first()?->lancamentos->first(fn ($l) => $l->nome === 'Notebook')?->parcelaTexto();
        $this->assertSame('2/6', $parcela('2026-11-01'));
        $this->assertSame('3/6', $parcela('2026-12-01'));
        $this->assertSame('6/6', $parcela('2027-03-01'));
        $this->assertNull(Mes::whereDate('competencia', '2027-04-01')->first(), 'não cria além da última parcela');

        $marco = Mes::whereDate('competencia', '2027-03-01')->first()->lancamentos->keyBy('nome');
        $this->assertEquals(375, $marco['Notebook']->valor);
        $this->assertEquals(65, $marco['netflix']->valor, 'o mês novo parte do último mês já criado (novembro), não de outubro');

        // desfazer tira os itens criados; refazer devolve
        $this->postJson('/api/meses/2026/10/desfazer')->assertOk();
        $this->assertNull($parcela('2027-03-01'));
        $this->postJson('/api/meses/2026/10/refazer')->assertOk();
        $this->assertSame('6/6', $parcela('2027-03-01'));
    }

    public function test_propagar_fixo_com_parcelas_nao_cria_meses(): void
    {
        $item = $this->item(['nome' => 'seguro', 'valor' => 383, 'parcela_atual' => 1, 'parcela_total' => 10]);

        $this->postJson("/api/lancamentos/{$item->id}/propagar")->assertOk()->assertJsonPath('meses', 0)->assertJsonPath('novos_meses', []);
        $this->assertNull(Mes::whereDate('competencia', '2026-11-01')->first());
    }

    public function test_propagar_avulso_tira_as_copias_dos_meses_seguintes(): void
    {
        $this->mesesComCopiaFixa('presente');
        $item = Lancamento::where('nome', 'presente')->where('mes_id', $this->outubro->id)->first();
        $this->patchJson("/api/lancamentos/{$item->id}", ['recorrente' => false])->assertOk();

        $this->postJson("/api/lancamentos/{$item->id}/propagar")->assertOk()->assertJsonPath('removidos', 4);
        $this->assertNull($this->noMes('2026-11-01', 'presente'));
        $this->assertNotNull(Lancamento::find($item->id), 'o do próprio mês fica');
    }

    public function test_propagar_nao_mexe_em_outro_usuario(): void
    {
        $item = $this->item(['recorrente' => false, 'parcela_atual' => 1, 'parcela_total' => 3]);
        Sanctum::actingAs(User::create(['name' => 'O', 'email' => 'o@o.com', 'password' => 'x']));

        $this->postJson("/api/lancamentos/{$item->id}/propagar")->assertNotFound();
    }

    public function test_gasto_variavel_repete_mas_nao_conta_como_fixo(): void
    {
        $this->item(['nome' => 'Condominio', 'valor' => 400, 'grupo' => 'pix']);
        $this->item(['nome' => 'Gasolina', 'valor' => 540, 'variavel' => true, 'grupo' => 'pix']);
        $this->item(['nome' => 'Mercado', 'valor' => 1000, 'variavel' => true, 'real' => 1130]);
        $this->item(['nome' => 'Presente', 'valor' => 100, 'recorrente' => false]);

        $t = $this->getJson('/api/meses/2026/10')->assertOk()->json('totais');
        $this->assertEquals(400, $t['total_fixo'], 'variável não entra no total fixo');
        $this->assertEquals(1540, $t['variaveis']);
        $this->assertEquals(400, $t['cortavel'] + $t['minimo']);

        // vai para o mês seguinte (como estimativa), com o real zerado, sem virar fixo
        $nov = $this->getJson('/api/meses/2026/11')->assertOk();
        $mercado = collect($nov->json('lancamentos'))->firstWhere('nome', 'Mercado');
        $this->assertTrue($mercado['recorrente']);
        $this->assertTrue($mercado['variavel']);
        $this->assertEquals(1000, $mercado['valor']);
        $this->assertNull($mercado['real']);
        $this->assertNull(collect($nov->json('lancamentos'))->firstWhere('nome', 'Presente'), 'avulso não repete');
        $this->assertEquals(1540, $nov->json('totais.variaveis'));
        $this->assertEquals(400, $nov->json('totais.total_fixo'));
    }

    public function test_marcar_como_variavel_entra_no_historico_e_desfaz(): void
    {
        $item = $this->item(['nome' => 'Mercado', 'valor' => 1000]);

        $this->patchJson("/api/lancamentos/{$item->id}", ['variavel' => true])->assertOk();
        $this->assertTrue($item->fresh()->variavel);
        $this->assertSame('Alterou Mercado', $this->getJson('/api/meses/2026/10/pilha')->json('desfazer.descricao'));

        $this->postJson('/api/meses/2026/10/desfazer')->assertOk();
        $this->assertFalse($item->fresh()->variavel);
        $this->postJson('/api/meses/2026/10/refazer')->assertOk();
        $this->assertTrue($item->fresh()->variavel);
    }

    public function test_propagar_leva_o_variavel_sem_mexer_no_valor_dos_outros_meses(): void
    {
        $item = $this->item(['nome' => 'Mercado', 'valor' => 1000, 'variavel' => true]);
        $nov = Mes::create(['user_id' => $this->user->id, 'competencia' => '2026-11-01']);
        $nov->lancamentos()->create(['grupo' => 'cartao', 'nome' => 'Mercado', 'valor' => 1200, 'recorrente' => true]);

        $this->postJson("/api/lancamentos/{$item->id}/propagar")->assertOk()->assertJsonPath('atualizados', 1);

        $copia = $nov->lancamentos()->first();
        $this->assertTrue($copia->variavel);
        $this->assertEquals(1200, $copia->valor, 'o valor de cada mês é preservado (varia)');
    }

    public function test_fixo_novo_ja_nasce_com_o_real_preenchido(): void
    {
        $id = $this->postJson('/api/meses/2026/10/lancamentos', ['grupo' => 'cartao', 'nome' => 'Spotify', 'valor' => 21.9, 'recorrente' => true])->assertCreated()->json('id');
        $this->assertEquals(21.9, Lancamento::find($id)->real);

        $avulso = $this->postJson('/api/meses/2026/10/lancamentos', ['grupo' => 'cartao', 'nome' => 'Padaria', 'valor' => 12])->assertCreated()->json('id');
        $this->assertNull(Lancamento::find($avulso)->real, 'avulso fica em aberto');

        $variavel = $this->postJson('/api/meses/2026/10/lancamentos', ['grupo' => 'pix', 'nome' => 'Mercado', 'valor' => 1000, 'recorrente' => true, 'variavel' => true])->assertCreated()->json('id');
        $this->assertNull(Lancamento::find($variavel)->real, 'variável fica em aberto');

        $saida = $this->postJson('/api/meses/2026/10/lancamentos', ['grupo' => 'saida', 'nome' => 'Luz', 'valor' => 100, 'recorrente' => true])->assertCreated()->json('id');
        $this->assertNull(Lancamento::find($saida)->real, 'só Cartão e PIX têm Real');
    }

    public function test_real_do_fixo_acompanha_o_valor_ate_ser_digitado(): void
    {
        $item = $this->item(['nome' => 'netflix', 'valor' => 59.9, 'real' => 59.9]);

        $this->patchJson("/api/lancamentos/{$item->id}", ['valor' => 64.9])->assertOk();
        $this->assertEquals(64.9, $item->fresh()->real, 'real acompanha o valor');

        // real digitado diferente do valor: deixa de acompanhar
        $this->patchJson("/api/lancamentos/{$item->id}", ['real' => 70])->assertOk();
        $this->patchJson("/api/lancamentos/{$item->id}", ['valor' => 80])->assertOk();
        $this->assertEquals(70, $item->fresh()->real, 'real digitado é respeitado');
        $this->assertEquals(80, $item->fresh()->valor);

        // mudar o valor e o real juntos: vale o que foi enviado
        $this->patchJson("/api/lancamentos/{$item->id}", ['valor' => 90, 'real' => 85])->assertOk();
        $this->assertEquals(85, $item->fresh()->real);
    }

    public function test_ao_virar_fixo_o_real_em_branco_e_preenchido(): void
    {
        $item = $this->item(['nome' => 'Gasolina', 'valor' => 540, 'recorrente' => false]);
        $this->assertNull($item->real);

        $this->patchJson("/api/lancamentos/{$item->id}", ['recorrente' => true])->assertOk();
        $this->assertEquals(540, $item->fresh()->real);

        // e se deixar de ser fixo, o Real automático some: volta a ficar em aberto
        $this->patchJson("/api/lancamentos/{$item->id}", ['recorrente' => false])->assertOk();
        $this->assertNull($item->fresh()->real);

        // um Real que o usuário digitou diferente do valor é mantido
        $outro = $this->item(['nome' => 'Spotify', 'valor' => 20, 'real' => 23]);
        $this->patchJson("/api/lancamentos/{$outro->id}", ['recorrente' => false])->assertOk();
        $this->assertEquals(23, $outro->fresh()->real);

        // variável continua em aberto
        $mercado = $this->item(['nome' => 'Mercado', 'valor' => 1000, 'recorrente' => false]);
        $this->patchJson("/api/lancamentos/{$mercado->id}", ['recorrente' => true, 'variavel' => true])->assertOk();
        $this->assertNull($mercado->fresh()->real);
    }

    public function test_desfazer_a_mudanca_de_valor_do_fixo_reverte_o_real_junto(): void
    {
        $item = $this->item(['nome' => 'netflix', 'valor' => 59.9, 'real' => 59.9]);
        $this->patchJson("/api/lancamentos/{$item->id}", ['valor' => 64.9])->assertOk();

        $this->postJson('/api/meses/2026/10/desfazer')->assertOk();
        $item->refresh();
        $this->assertEquals(59.9, $item->valor);
        $this->assertEquals(59.9, $item->real);

        $this->postJson('/api/meses/2026/10/refazer')->assertOk();
        $this->assertEquals(64.9, $item->fresh()->real);
    }

    public function test_mes_novo_traz_fixos_com_real_e_o_resto_em_aberto(): void
    {
        $this->item(['nome' => 'netflix', 'valor' => 60, 'real' => 58]);
        $this->item(['nome' => 'Mercado', 'valor' => 1000, 'variavel' => true, 'real' => 1130]);
        $this->item(['nome' => 'TV', 'valor' => 250, 'recorrente' => false, 'parcela_atual' => 1, 'parcela_total' => 3, 'real' => 250]);

        $nov = collect($this->getJson('/api/meses/2026/11')->assertOk()->json('lancamentos'))->keyBy('nome');
        $this->assertEquals(60, $nov['netflix']['real'], 'fixo vem com o Real = valor do mês anterior, não com o real anterior');
        $this->assertNull($nov['Mercado']['real']);
        $this->assertNull($nov['TV']['real']);
    }

    public function test_migration_de_preenchimento_so_mexe_nos_fixos_em_branco(): void
    {
        $fixo = $this->item(['nome' => 'a', 'valor' => 10, 'real' => null]);
        $lancado = $this->item(['nome' => 'b', 'valor' => 10, 'real' => 7]);
        $variavel = $this->item(['nome' => 'c', 'valor' => 10, 'variavel' => true]);
        $avulso = $this->item(['nome' => 'd', 'valor' => 10, 'recorrente' => false]);
        $saida = $this->item(['nome' => 'e', 'valor' => 10, 'grupo' => 'saida']);
        // a regra vale do mês atual em diante: meses passados são histórico
        \Illuminate\Support\Carbon::setTestNow('2026-10-15');
        $passado = Mes::create(['user_id' => $this->user->id, 'competencia' => '2024-08-01']);
        $antigo = $passado->lancamentos()->create(['grupo' => 'pix', 'nome' => 'antigo', 'valor' => 10, 'recorrente' => true]);
        Lancamento::query()->update(['real' => null]);
        Lancamento::whereKey($lancado->id)->update(['real' => 7]);

        (include database_path('migrations/'.collect(scandir(database_path('migrations')))->first(fn ($f) => str_contains($f, 'preenche_real_dos_fixos'))))->up();

        $this->assertEquals(10, $fixo->fresh()->real);
        $this->assertNull($antigo->fresh()->real, 'mês passado não é reescrito');
        $this->assertEquals(7, $lancado->fresh()->real, 'o que já foi lançado não muda');
        $this->assertNull($variavel->fresh()->real);
        $this->assertNull($avulso->fresh()->real);
        $this->assertNull($saida->fresh()->real);
    }
}
