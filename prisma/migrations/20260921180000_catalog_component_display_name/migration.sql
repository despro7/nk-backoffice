-- Локальна назва інгредієнта для рядка специфікації (override каталогу)
ALTER TABLE `catalog_good_components` ADD COLUMN `componentDisplayName` VARCHAR(512) NULL;
