-- CreateTable
CREATE TABLE `warehouse_return_history` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` INTEGER NOT NULL,
    `orderNumber` VARCHAR(191) NOT NULL,
    `ttn` VARCHAR(255) NULL,
    `firmId` VARCHAR(255) NULL,
    `firmName` VARCHAR(255) NULL,
    `orderDate` DATETIME(3) NULL,
    `items` LONGTEXT NOT NULL,
    `returnReason` VARCHAR(191) NOT NULL,
    `customReason` TEXT NULL,
    `comment` TEXT NULL,
    `payload` LONGTEXT NOT NULL,
    `createdBy` INTEGER NOT NULL,
    `createdByName` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `warehouse_return_history_orderId_idx`(`orderId`),
    INDEX `warehouse_return_history_createdAt_idx`(`createdAt`),
    INDEX `warehouse_return_history_createdBy_idx`(`createdBy`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
