-- CreateTable
CREATE TABLE `warehouse_write_off_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderId` INTEGER NULL,
    `orderNumber` VARCHAR(191) NULL,
    `writeOffNumber` VARCHAR(255) NULL,
    `firmId` VARCHAR(255) NULL,
    `firmName` VARCHAR(255) NULL,
    `storageId` VARCHAR(255) NULL,
    `writeOffDate` DATETIME(3) NULL,
    `items` LONGTEXT NOT NULL,
    `writeOffReason` VARCHAR(191) NOT NULL,
    `customReason` TEXT NULL,
    `comment` TEXT NULL,
    `payload` LONGTEXT NOT NULL,
    `createdBy` INTEGER NOT NULL,
    `createdByName` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `warehouse_write_off_history_orderId_idx`(`orderId`),
    INDEX `warehouse_write_off_history_writeOffNumber_idx`(`writeOffNumber`),
    INDEX `warehouse_write_off_history_createdAt_idx`(`createdAt`),
    INDEX `warehouse_write_off_history_createdBy_idx`(`createdBy`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
