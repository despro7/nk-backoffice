-- Legacy `products` більше не читається і не пишеться (джерело правди: catalog_*).
-- Перед застосуванням зробіть дамп: mysqldump serv_backoffice products > products_backup.sql
DROP TABLE `products`;
