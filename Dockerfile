FROM php:8.3-fpm

RUN apt-get update && apt-get install -y \
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

EXPOSE 8000

CMD ["php-fpm"]
COPY backend/cacert.pem /usr/local/share/ca-certificates/cacert.pem

# Configura o PHP para usar o cacert.pem
RUN echo 'curl.cainfo="/usr/local/share/ca-certificates/cacert.pem"' >> /usr/local/etc/php/conf.d/cacert.ini \
	&& echo 'openssl.cafile="/usr/local/share/ca-certificates/cacert.pem"' >> /usr/local/etc/php/conf.d/cacert.ini

# Instala Composer
COPY --from=composer:2.7 /usr/bin/composer /usr/bin/composer

# Cria diretório de trabalho
WORKDIR /var/www

# Copia arquivos do projeto
COPY backend/ .

# Instala dependências do Laravel
RUN composer install --no-interaction --prefer-dist --optimize-autoloader

# Permissões
RUN chown -R www-data:www-data /var/www/storage /var/www/bootstrap/cache

# Expondo porta padrão do PHP-FPM
EXPOSE 9000

CMD ["php-fpm"]
