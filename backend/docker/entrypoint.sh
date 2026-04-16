#!/bin/sh
set -e

# Remove o arquivo PID do nginx, se existir
if [ -f /var/run/nginx.pid ]; then
    rm /var/run/nginx.pid
fi

# Inicia o PHP-FPM em background
php-fpm &

# Inicia o Nginx no foreground
nginx -g 'daemon off;'