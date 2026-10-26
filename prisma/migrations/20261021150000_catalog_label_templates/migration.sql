-- Master-шаблони наліпок (pdfme) + override пресета на товарі.

ALTER TABLE `catalog_goods`
  ADD COLUMN `portionLabelTemplateId` VARCHAR(36) NULL,
  ADD COLUMN `boxLabelTemplateId` VARCHAR(36) NULL;

CREATE TABLE `catalog_label_templates` (
  `id` VARCHAR(36) NOT NULL,
  `slug` VARCHAR(64) NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `labelKind` VARCHAR(16) NOT NULL,
  `audience` VARCHAR(16) NOT NULL,
  `templateJson` JSON NOT NULL,
  `basePdfMeta` JSON NULL,
  `schemaVersion` INTEGER NOT NULL DEFAULT 1,
  `isArchived` BOOLEAN NOT NULL DEFAULT false,
  `updatedBy` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `catalog_label_templates_slug_key`(`slug`),
  INDEX `catalog_label_templates_labelKind_audience_isArchived_idx`(`labelKind`, `audience`, `isArchived`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `catalog_label_template_defaults` (
  `audience` VARCHAR(16) NOT NULL,
  `labelKind` VARCHAR(16) NOT NULL,
  `templateId` VARCHAR(36) NOT NULL,
  PRIMARY KEY (`audience`, `labelKind`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `catalog_goods`
  ADD CONSTRAINT `catalog_goods_portionLabelTemplateId_fkey`
    FOREIGN KEY (`portionLabelTemplateId`) REFERENCES `catalog_label_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `catalog_goods_boxLabelTemplateId_fkey`
    FOREIGN KEY (`boxLabelTemplateId`) REFERENCES `catalog_label_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `catalog_label_templates`
  ADD CONSTRAINT `catalog_label_templates_updatedBy_fkey`
    FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `catalog_label_template_defaults`
  ADD CONSTRAINT `catalog_label_template_defaults_templateId_fkey`
    FOREIGN KEY (`templateId`) REFERENCES `catalog_label_templates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO `role_permissions` (`roleId`, `permissionKey`)
SELECT r.`id`, 'page.settings.labelTemplates'
FROM `roles` r
WHERE r.`slug` IN ('admin', 'boss')
  AND NOT EXISTS (
    SELECT 1
    FROM `role_permissions` rp
    WHERE rp.`roleId` = r.`id`
      AND rp.`permissionKey` = 'page.settings.labelTemplates'
  );

