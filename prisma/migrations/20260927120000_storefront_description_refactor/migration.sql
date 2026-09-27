-- Refactor storefront description: doc-based editor, ingredients JSON, drop obsolete overrides

ALTER TABLE `catalog_goods`
  ADD COLUMN `productIngredientsJson` TEXT NULL,
  ADD COLUMN `storefrontDescriptionDoc` TEXT NULL,
  DROP COLUMN `productMarketingText`,
  DROP COLUMN `productIngredientsText`,
  DROP COLUMN `productIngredientsMode`,
  DROP COLUMN `productStorageText`,
  DROP COLUMN `productHeatingOverride`,
  DROP COLUMN `productSaltOverride`,
  DROP COLUMN `productNetWeightTemplateOverride`,
  DROP COLUMN `productGrossWeightTemplateOverride`;

-- Default preset without marketing block (freeform paragraphs in doc)
UPDATE `catalog_storefront_presets`
SET `blocksJson` = '[{"id":"natural","enabled":true},{"id":"salt","enabled":true},{"id":"ingredients","enabled":true},{"id":"nutrition","enabled":true},{"id":"storage","enabled":true},{"id":"heating","enabled":true},{"id":"netWeight","enabled":true},{"id":"grossWeight","enabled":true},{"id":"kitComponents","enabled":false}]'
WHERE `id` = '00000000-0000-4000-8000-000000000001';
