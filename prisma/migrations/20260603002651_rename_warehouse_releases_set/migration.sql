/*
  Warnings:

  - You are about to drop the `WarehouseSetRelease` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE `WarehouseSetRelease`;

-- CreateTable
CREATE TABLE `warehouse_release_set` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `setSku` VARCHAR(191) NULL,
    `quantity` INTEGER NOT NULL,
    `items` JSON NOT NULL,
    `storageId` VARCHAR(191) NULL,
    `firmId` INTEGER NULL,
    `comment` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'created',
    `createdBy` INTEGER NULL,
    `createdByName` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `warehouse_release_set_setSku_idx`(`setSku`),
    INDEX `warehouse_release_set_status_idx`(`status`),
    INDEX `warehouse_release_set_createdBy_idx`(`createdBy`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
