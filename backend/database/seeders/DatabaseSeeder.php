<?php

namespace Database\Seeders;

use App\Models\Mes;
use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        User::updateOrCreate(
            ['email' => 'phvs.pedro@hotmail.com'],
            ['name' => 'Pedro', 'password' => 'pedro101'],
        );

        $admin = User::updateOrCreate(
            ['email' => 'admin@admin.com'],
            ['name' => 'Admin', 'password' => 'admin101'],
        );

        if (Mes::where('user_id', $admin->id)->exists()) {
            return;
        }

        $this->call(PlanilhaAgosto2024Seeder::class, parameters: ['user' => $admin]);
    }
}
