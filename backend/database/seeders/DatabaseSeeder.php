<?php

namespace Database\Seeders;

use App\Models\Mes;
use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
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
