#!/bin/sh
set -e

php artisan migrate --force
# Cria/garante o usuário admin (e os dados iniciais na primeira vez)
php artisan db:seed --force
php artisan config:cache
php artisan route:cache

chown -R www-data:www-data storage bootstrap/cache

exec "$@"
