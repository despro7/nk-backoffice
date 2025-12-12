-- Remove duplicate dilovodGood field from products table
-- Data has been migrated to dilovodId field
ALTER TABLE `products` DROP COLUMN `dilovodGood`;