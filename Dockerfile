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
    libpq-dev

RUN docker-php-ext-install pdo pdo_mysql mbstring exif pcntl bcmath gd pdo_sqlite pdo_pgsql pgsql

# Corrige diretórios do Nginx (não cria o arquivo PID no build)
RUN mkdir -p /var/run/nginx \
    && mkdir -p /var/log/nginx \
    && chown -R www-data:www-data /var/run/nginx /var/log/nginx

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
COPY backend/docker/nginx/default.conf /etc/nginx/conf.d/default.conf
# Testa a configuração do Nginx durante o build
RUN nginx -t


nodaemon=true

[program:php-fpm]
command=php-fpm

[program:nginx]
command=nginx -g "daemon off;"

# Entrypoint para rodar php-fpm e nginx juntos e garantir que o PID não cause problemas
COPY backend/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80
EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
# force rebuild
