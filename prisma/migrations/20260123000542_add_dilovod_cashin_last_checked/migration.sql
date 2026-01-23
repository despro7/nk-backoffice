-- AlterTable
ALTER TABLE `orders` ADD COLUMN `dilovodCashInLastChecked` DATETIME(3) NULL COMMENT 'Дата останньої перевірки cashIn (для уникнення частих запитів)';
