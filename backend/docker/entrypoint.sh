#!/bin/sh
set -e

# Remove o arquivo PID do nginx, se existir
if [ -f /var/run/nginx.pid ]; then
    rm /var/run/nginx.pid
fi

# Cria o banco SQLite se não existir
touch /var/www/database/database.sqlite

# Roda as migrations
php /var/www/artisan migrate --force

# Inicia o PHP-FPM em background
php-fpm &

# Inicia o Nginx no foreground
nginx -g 'daemon off;'
