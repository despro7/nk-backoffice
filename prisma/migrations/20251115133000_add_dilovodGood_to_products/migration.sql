-- AlterTable: add dilovodGood field to products
ALTER TABLE `products` ADD COLUMN `dilovodGood` VARCHAR(64) NULL;

-- Backfill existing mapping from goods_cache into products.dilovodGood
UPDATE `products` p
JOIN `goods_cache` g ON g.productNum = p.sku
SET p.dilovodGood = g.good_id
WHERE p.dilovodGood IS NULL;
