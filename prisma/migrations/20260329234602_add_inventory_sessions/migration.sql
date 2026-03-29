-- CreateTable
CREATE TABLE `inventory_sessions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `warehouse` VARCHAR(191) NOT NULL DEFAULT 'small',
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `comment` TEXT NULL,
    `items` LONGTEXT NOT NULL,
    `createdBy` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `completedAt` DATETIME(3) NULL,

    INDEX `inventory_sessions_status_idx`(`status`),
    INDEX `inventory_sessions_createdBy_idx`(`createdBy`),
    INDEX `inventory_sessions_createdAt_idx`(`createdAt`),
    INDEX `inventory_sessions_warehouse_idx`(`warehouse`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
