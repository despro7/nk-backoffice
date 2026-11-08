-- Notification Centre: output rules, glossary, config history.
-- Rows are seeded at runtime from shared/notifications/defaultRules.ts when the tables are empty.

-- CreateTable
CREATE TABLE `notification_rules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(64) NULL,
    `name` VARCHAR(160) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `position` INTEGER NOT NULL DEFAULT 0,
    `match` JSON NOT NULL,
    `output` JSON NOT NULL,
    `updatedById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `notification_rules_key_key`(`key`),
    INDEX `notification_rules_position_idx`(`position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_glossary` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `phrase` VARCHAR(300) NOT NULL,
    `replacement` VARCHAR(500) NOT NULL,
    `isRegex` BOOLEAN NOT NULL DEFAULT false,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `position` INTEGER NOT NULL DEFAULT 0,
    `updatedById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `notification_glossary_position_idx`(`position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_config_revisions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entity` VARCHAR(16) NOT NULL,
    `entityId` INTEGER NULL,
    `action` VARCHAR(16) NOT NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `userId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notification_config_revisions_entity_entityId_idx`(`entity`, `entityId`),
    INDEX `notification_config_revisions_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Keep today's behaviour: every non-admin role sees errors and warnings of all groups in the app,
-- plus warehouse / product successes (auto-finalize, approved specs). Telegram is off by default.
-- admin has every permission implicitly.
INSERT INTO `role_permissions` (`roleId`, `permissionKey`)
SELECT r.`id`, k.`permissionKey`
FROM `roles` r
CROSS JOIN (
  SELECT 'action.notify.assembly.error.app' AS `permissionKey`
  UNION ALL SELECT 'action.notify.assembly.warning.app'
  UNION ALL SELECT 'action.notify.dilovod.error.app'
  UNION ALL SELECT 'action.notify.dilovod.warning.app'
  UNION ALL SELECT 'action.notify.sync.error.app'
  UNION ALL SELECT 'action.notify.sync.warning.app'
  UNION ALL SELECT 'action.notify.warehouse.error.app'
  UNION ALL SELECT 'action.notify.warehouse.warning.app'
  UNION ALL SELECT 'action.notify.warehouse.success.app'
  UNION ALL SELECT 'action.notify.products.error.app'
  UNION ALL SELECT 'action.notify.products.warning.app'
  UNION ALL SELECT 'action.notify.products.success.app'
  UNION ALL SELECT 'action.notify.system.error.app'
  UNION ALL SELECT 'action.notify.system.warning.app'
) k
WHERE r.`slug` <> 'admin'
  AND NOT EXISTS (
    SELECT 1
    FROM `role_permissions` rp
    WHERE rp.`roleId` = r.`id`
      AND rp.`permissionKey` = k.`permissionKey`
  );
