-- Techcards phase 3a: production batches (internal production documents).
-- CreateTable
CREATE TABLE `production_batches` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `number` VARCHAR(24) NOT NULL,
    `goodId` VARCHAR(32) NOT NULL,
    `techCardVersion` INTEGER NOT NULL,
    `specVersion` INTEGER NULL,
    `snapshotJson` JSON NOT NULL,
    `plannedPortions` INTEGER NOT NULL,
    `plannedDate` DATE NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'draft',
    `factJson` JSON NULL,
    `comment` TEXT NULL,
    `createdById` INTEGER NULL,
    `cancelledAt` DATETIME(3) NULL,
    `cancelledById` INTEGER NULL,
    `cancelReason` TEXT NULL,
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `production_batches_number_key`(`number`),
    INDEX `production_batches_goodId_idx`(`goodId`),
    INDEX `production_batches_status_idx`(`status`),
    INDEX `production_batches_plannedDate_idx`(`plannedDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `production_batch_lines` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `batchId` INTEGER NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `goodId` VARCHAR(32) NOT NULL,
    `rowKey` VARCHAR(64) NULL,
    `name` VARCHAR(255) NOT NULL,
    `unitId` VARCHAR(32) NULL,
    `unitName` VARCHAR(32) NULL,
    `plannedQty` DOUBLE NOT NULL,
    `plannedNetKg` DOUBLE NULL,
    `plannedGrossKg` DOUBLE NULL,
    `lossesJson` JSON NULL,
    `stockRawSnap` DOUBLE NULL,
    `stockProdSnap` DOUBLE NULL,
    `stockSnapAt` DATETIME(3) NULL,
    `stockActual` DOUBLE NULL,
    `issuedQty` DOUBLE NULL,
    `issueNote` TEXT NULL,
    `shortageComment` TEXT NULL,
    `consumedQty` DOUBLE NULL,
    `leftoverQty` DOUBLE NULL,
    `leftoverAction` VARCHAR(16) NULL,
    `note` TEXT NULL,

    INDEX `production_batch_lines_batchId_idx`(`batchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `production_batch_stages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `batchId` INTEGER NOT NULL,
    `stageKey` VARCHAR(64) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `name` VARCHAR(255) NOT NULL,
    `plannedOffsetMin` INTEGER NULL,
    `plannedDurationMin` INTEGER NULL,
    `startedAt` DATETIME(3) NULL,
    `startedById` INTEGER NULL,
    `finishedAt` DATETIME(3) NULL,
    `finishedById` INTEGER NULL,
    `actualTemp` VARCHAR(64) NULL,
    `comment` TEXT NULL,

    INDEX `production_batch_stages_batchId_idx`(`batchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `production_batch_signatures` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `batchId` INTEGER NOT NULL,
    `step` VARCHAR(16) NOT NULL,
    `userId` INTEGER NOT NULL,
    `userName` VARCHAR(255) NOT NULL,
    `roleLabel` VARCHAR(128) NULL,
    `signedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,
    `revokedById` INTEGER NULL,
    `revokeComment` TEXT NULL,

    INDEX `production_batch_signatures_batchId_idx`(`batchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `production_batch_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `batchId` INTEGER NOT NULL,
    `type` VARCHAR(32) NOT NULL,
    `userId` INTEGER NULL,
    `userName` VARCHAR(255) NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `payloadJson` JSON NULL,

    INDEX `production_batch_events_batchId_at_idx`(`batchId`, `at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `production_batches` ADD CONSTRAINT `production_batches_goodId_fkey` FOREIGN KEY (`goodId`) REFERENCES `catalog_goods`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `production_batch_lines` ADD CONSTRAINT `production_batch_lines_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `production_batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `production_batch_stages` ADD CONSTRAINT `production_batch_stages_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `production_batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `production_batch_signatures` ADD CONSTRAINT `production_batch_signatures_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `production_batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `production_batch_events` ADD CONSTRAINT `production_batch_events_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `production_batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Grant page.production.batches (view batches) to system roles at storekeeper rank and above; admin has it implicitly.
INSERT INTO `role_permissions` (`roleId`, `permissionKey`)
SELECT r.`id`, 'page.production.batches'
FROM `roles` r
WHERE r.`slug` IN ('storekeeper', 'warehouse-manager', 'shop-manager', 'boss')
  AND NOT EXISTS (
    SELECT 1 FROM `role_permissions` rp WHERE rp.`roleId` = r.`id` AND rp.`permissionKey` = 'page.production.batches'
  );

-- Batch step actions: issue – storekeeper and boss; create, production steps, finished acceptance, revoke – boss
-- (no production manager / sales manager roles yet: the owner assigns them in role permissions).
INSERT INTO `role_permissions` (`roleId`, `permissionKey`)
SELECT r.`id`, 'action.production.batches.create'
FROM `roles` r
WHERE r.`slug` IN ('boss')
  AND NOT EXISTS (
    SELECT 1 FROM `role_permissions` rp WHERE rp.`roleId` = r.`id` AND rp.`permissionKey` = 'action.production.batches.create'
  );
INSERT INTO `role_permissions` (`roleId`, `permissionKey`)
SELECT r.`id`, 'action.production.batches.issue'
FROM `roles` r
WHERE r.`slug` IN ('storekeeper', 'boss')
  AND NOT EXISTS (
    SELECT 1 FROM `role_permissions` rp WHERE rp.`roleId` = r.`id` AND rp.`permissionKey` = 'action.production.batches.issue'
  );
INSERT INTO `role_permissions` (`roleId`, `permissionKey`)
SELECT r.`id`, 'action.production.batches.acceptProduction'
FROM `roles` r
WHERE r.`slug` IN ('boss')
  AND NOT EXISTS (
    SELECT 1 FROM `role_permissions` rp WHERE rp.`roleId` = r.`id` AND rp.`permissionKey` = 'action.production.batches.acceptProduction'
  );
INSERT INTO `role_permissions` (`roleId`, `permissionKey`)
SELECT r.`id`, 'action.production.batches.cook'
FROM `roles` r
WHERE r.`slug` IN ('boss')
  AND NOT EXISTS (
    SELECT 1 FROM `role_permissions` rp WHERE rp.`roleId` = r.`id` AND rp.`permissionKey` = 'action.production.batches.cook'
  );
INSERT INTO `role_permissions` (`roleId`, `permissionKey`)
SELECT r.`id`, 'action.production.batches.acceptFinished'
FROM `roles` r
WHERE r.`slug` IN ('boss')
  AND NOT EXISTS (
    SELECT 1 FROM `role_permissions` rp WHERE rp.`roleId` = r.`id` AND rp.`permissionKey` = 'action.production.batches.acceptFinished'
  );
INSERT INTO `role_permissions` (`roleId`, `permissionKey`)
SELECT r.`id`, 'action.production.batches.revokeAny'
FROM `roles` r
WHERE r.`slug` IN ('boss')
  AND NOT EXISTS (
    SELECT 1 FROM `role_permissions` rp WHERE rp.`roleId` = r.`id` AND rp.`permissionKey` = 'action.production.batches.revokeAny'
  );
