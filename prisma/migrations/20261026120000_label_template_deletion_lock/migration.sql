ALTER TABLE `catalog_label_templates`
  ADD COLUMN `isDeletionLocked` BOOLEAN NOT NULL DEFAULT false;

UPDATE `catalog_label_templates`
SET `isDeletionLocked` = true
WHERE `slug` IN ('portion-good', 'portion-kit', 'box-good', 'box-kit');
