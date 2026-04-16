FROM php:8.3-fpm

# Instala dependências do sistema e Nginx
RUN apt-get update && apt-get install -y \
    nginx \
    git \
    curl \
    libpng-dev \
    libonig-dev \
    libxml2-dev \
    zip \
    unzip \
    sqlite3 \
    libsqlite3-dev \
    libpq-dev \
    supervisor

RUN docker-php-ext-install pdo pdo_mysql mbstring exif pcntl bcmath gd pdo_sqlite pdo_pgsql pgsql

# Instala Composer
COPY --from=composer:2.7 /usr/bin/composer /usr/bin/composer

# Copia o cacert.pem para o container
COPY backend/cacert.pem /usr/local/share/ca-certificates/cacert.pem

# Configura o PHP para usar o cacert.pem
RUN echo 'curl.cainfo="/usr/local/share/ca-certificates/cacert.pem"' >> /usr/local/etc/php/conf.d/cacert.ini \
    && echo 'openssl.cafile="/usr/local/share/ca-certificates/cacert.pem"' >> /usr/local/etc/php/conf.d/cacert.ini

WORKDIR /var/www

# Copia apenas o backend (Laravel) para dentro do container
COPY backend/ .

RUN composer install --no-interaction --prefer-dist --optimize-autoloader
RUN php artisan key:generate || true
RUN chown -R www-data:www-data /var/www/storage /var/www/bootstrap/cache

# Configuração do Nginx para servir Laravel
RUN echo 'server {\n\
    listen 80;\n\
    index index.php index.html;\n\
    root /var/www/public;\n\
    location / {\n\
        try_files $uri $uri/ /index.php?$query_string;\n\
    }\n\
    location ~ \\.php$ {\n\
        fastcgi_pass 127.0.0.1:9000;\n\
        fastcgi_index index.php;\n\
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;\n\
        include fastcgi_params;\n\
    }\n\
    location ~ /\\.ht {\n\
        deny all;\n\
    }\n\
}' > /etc/nginx/conf.d/default.conf

# Configuração do Supervisor para rodar Nginx e PHP-FPM juntos
RUN echo '[supervisord]\nnodaemon=true\n[program:php-fpm]\ncommand=php-fpm\n[program:nginx]\ncommand=nginx -g \"daemon off;\"' > /etc/supervisor/conf.d/supervisord.conf

EXPOSE 80

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]