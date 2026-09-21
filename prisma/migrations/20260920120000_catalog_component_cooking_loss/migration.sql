-- Локальне поле % втрат при готуванні для рядків специфікації
ALTER TABLE `catalog_good_components` ADD COLUMN `cookingLossPercent` DOUBLE NULL DEFAULT 0;
