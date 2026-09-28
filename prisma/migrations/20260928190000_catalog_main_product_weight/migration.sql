-- Маса осн. продукту: окреме поле та блок конструктора опису

ALTER TABLE `catalog_goods`
  ADD COLUMN `mainProductWeight` DOUBLE NULL;

UPDATE `catalog_storefront_presets`
SET `blocksJson` = '[{"id":"natural","enabled":true},{"id":"salt","enabled":true},{"id":"ingredients","enabled":true},{"id":"nutrition","enabled":true},{"id":"storage","enabled":true},{"id":"heating","enabled":true},{"id":"netWeight","enabled":true},{"id":"mainProductWeight","enabled":true},{"id":"grossWeight","enabled":false},{"id":"kitComponents","enabled":false}]'
WHERE `id` = '00000000-0000-4000-8000-000000000001';
