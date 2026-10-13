<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LoginTest extends TestCase
{
    use RefreshDatabase;

    public function test_api_exige_login(): void
    {
        $this->getJson('/api/meses')->assertUnauthorized();
    }

    public function test_lembrar_me_gera_token_permanente_e_revogar_apaga_todos(): void
    {
        User::create(['name' => 'Pedro', 'email' => 'phvs.pedro@hotmail.com', 'password' => 'pedro101']);

        $this->postJson('/api/login', ['email' => 'phvs.pedro@hotmail.com', 'password' => 'pedro101', 'remember' => true])->assertOk();
        $this->postJson('/api/login', ['email' => 'phvs.pedro@hotmail.com', 'password' => 'pedro101'])->assertOk();

        $this->assertDatabaseCount('personal_access_tokens', 2);
        $this->assertDatabaseHas('personal_access_tokens', ['expires_at' => null]);

        $this->artisan('auth:revogar')->assertSuccessful();
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }
}
