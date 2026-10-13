FROM php:8.4-fpm-alpine

RUN docker-php-ext-install pdo_mysql bcmath opcache \
    && { echo 'opcache.enable=1'; echo 'opcache.validate_timestamps=0'; } > /usr/local/etc/php/conf.d/opcache-app.ini

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction

COPY . .
RUN composer dump-autoload --optimize --no-dev \
    && chown -R www-data:www-data storage bootstrap/cache

COPY docker/entrypoint.sh /usr/local/bin/entrypoint
RUN chmod +x /usr/local/bin/entrypoint

ENTRYPOINT ["entrypoint"]
CMD ["php-fpm"]
