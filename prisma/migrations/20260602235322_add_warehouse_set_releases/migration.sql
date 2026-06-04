-- CreateTable
CREATE TABLE `WarehouseSetRelease` (
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

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
