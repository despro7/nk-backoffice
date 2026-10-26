ALTER TABLE `catalog_label_templates`
  ADD COLUMN `iconKey` VARCHAR(48) NULL;

UPDATE `catalog_label_templates`
SET `iconKey` = CASE
  WHEN `labelKind` = 'box' THEN 'package'
  WHEN `labelKind` = 'portion' THEN 'scan-line'
  ELSE 'tags'
END
WHERE `iconKey` IS NULL;
