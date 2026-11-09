-- Techcards phase 2b: stable spec row key (local only) referenced by techcard stages and dosing.
ALTER TABLE `catalog_good_components` ADD COLUMN `rowKey` VARCHAR(64) NULL AFTER `lossesJson`;

-- Backfill: every existing row gets its own key.
UPDATE `catalog_good_components` SET `rowKey` = UUID() WHERE `rowKey` IS NULL;
