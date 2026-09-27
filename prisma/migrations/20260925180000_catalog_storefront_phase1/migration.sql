-- Phase 1: WooCommerce storefront fields on catalog_goods + presets table

ALTER TABLE `catalog_goods`
  ADD COLUMN `doNotPublish` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `storefrontPresetId` VARCHAR(36) NULL,
  ADD COLUMN `productIngredientsJson` TEXT NULL,
  ADD COLUMN `productNutritionJson` TEXT NULL,
  ADD COLUMN `storefrontDescriptionDoc` TEXT NULL,
  ADD COLUMN `grossWeight` DOUBLE NULL,
  ADD COLUMN `wooProductId` INTEGER NULL,
  ADD COLUMN `wooLastSyncedAt` DATETIME(3) NULL;

CREATE INDEX `catalog_goods_storefrontPresetId_idx` ON `catalog_goods`(`storefrontPresetId`);

CREATE TABLE `catalog_storefront_presets` (
  `id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `isDefault` BOOLEAN NOT NULL DEFAULT false,
  `blocksJson` TEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `catalog_storefront_presets_isDefault_idx`(`isDefault`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Default preset «Стандарт»
INSERT INTO `catalog_storefront_presets` (`id`, `name`, `isDefault`, `blocksJson`, `createdAt`, `updatedAt`)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'Стандарт',
  true,
  '[{"id":"natural","enabled":true},{"id":"salt","enabled":true},{"id":"ingredients","enabled":true},{"id":"nutrition","enabled":true},{"id":"storage","enabled":true},{"id":"heating","enabled":true},{"id":"netWeight","enabled":true},{"id":"grossWeight","enabled":true},{"id":"kitComponents","enabled":false}]',
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
);

-- Global storefront templates (seeded, editable in Settings)
INSERT INTO `settings_base` (`key`, `value`, `description`, `category`, `isActive`, `createdAt`, `updatedAt`)
VALUES (
  'storefront.templates',
  '{"tpl_salt":"Містить сіль. Рекомендована добова норма споживання солі для дорослої людини — не більше 5 г.","tpl_storage":"Зберігати за температури від 0°С до 25°С за відносної вологості повітря не більше 75%. У разі відкриття упаковки зберігати в холодильнику не більше 24 годин.","tpl_heating":"<p>Способи розігріву:</p><ol><li>Розігріти у мікрохвильовій печі 2 хвилини при потужності 800 Вт (не розігрівати у пакеті).</li><li>Розігріти на сковорідці на середньому вогні 5–7 хвилин, періодично помішуючи.</li><li>Розігріти на паровій бані 10–15 хвилин до повного прогрівання.</li></ol>","tpl_natural":"Приготований з натуральних інгредієнтів без штучних барвників та консервантів.","tpl_net_weight":"Маса нетто: {{netWeight}}","tpl_gross_weight":"Маса брутто: {{grossWeight}}"}',
  'Шаблони блоків опису вітрини',
  'storefront',
  true,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

INSERT INTO `settings_base` (`key`, `value`, `description`, `category`, `isActive`, `createdAt`, `updatedAt`)
VALUES (
  'storefront.defaultPresetId',
  '00000000-0000-4000-8000-000000000001',
  'Default preset id для конструктора опису вітрини',
  'storefront',
  true,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);
