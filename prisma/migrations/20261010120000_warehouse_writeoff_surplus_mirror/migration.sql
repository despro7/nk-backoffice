-- Deduplicate writeOffNumber before unique constraint
DELETE w1 FROM `warehouse_write_off_history` w1
INNER JOIN `warehouse_write_off_history` w2
  ON w1.`writeOffNumber` = w2.`writeOffNumber`
  AND w1.`writeOffNumber` IS NOT NULL
  AND w1.`id` < w2.`id`;

-- AlterTable warehouse_write_off_history
ALTER TABLE `warehouse_write_off_history`
    ADD COLUMN `docNumber` VARCHAR(255) NULL,
    ADD COLUMN `remark` TEXT NULL,
    ADD COLUMN `source` VARCHAR(32) NOT NULL DEFAULT 'local',
    ADD COLUMN `status` VARCHAR(32) NOT NULL DEFAULT 'created';

DROP INDEX `warehouse_write_off_history_writeOffNumber_idx` ON `warehouse_write_off_history`;
CREATE UNIQUE INDEX `warehouse_write_off_history_writeOffNumber_key` ON `warehouse_write_off_history`(`writeOffNumber`);
CREATE INDEX `warehouse_write_off_history_status_idx` ON `warehouse_write_off_history`(`status`);

-- CreateTable warehouse_surplus_history
CREATE TABLE `warehouse_surplus_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `surplusNumber` VARCHAR(255) NULL,
    `docNumber` VARCHAR(255) NULL,
    `firmId` VARCHAR(255) NULL,
    `storageId` VARCHAR(255) NULL,
    `surplusDate` DATETIME(3) NULL,
    `items` LONGTEXT NOT NULL,
    `surplusReason` VARCHAR(191) NOT NULL,
    `customReason` TEXT NULL,
    `comment` TEXT NULL,
    `remark` TEXT NULL,
    `source` VARCHAR(32) NOT NULL DEFAULT 'local',
    `status` VARCHAR(32) NOT NULL DEFAULT 'created',
    `payload` LONGTEXT NOT NULL,
    `createdBy` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `warehouse_surplus_history_surplusNumber_key`(`surplusNumber`),
    INDEX `warehouse_surplus_history_createdAt_idx`(`createdAt`),
    INDEX `warehouse_surplus_history_createdBy_idx`(`createdBy`),
    INDEX `warehouse_surplus_history_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
