-- CreateTable
CREATE TABLE `materials` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dilovodId` VARCHAR(191) NOT NULL,
    `sku` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `parentId` VARCHAR(191) NOT NULL,
    `categoryId` INTEGER NULL,
    `categoryName` VARCHAR(191) NULL,
    `barcode` VARCHAR(191) NULL,
    `manualOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastSyncAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `materials_dilovodId_key`(`dilovodId`),
    UNIQUE INDEX `materials_sku_key`(`sku`),
    INDEX `materials_sku_idx`(`sku`),
    INDEX `materials_parentId_idx`(`parentId`),
    INDEX `materials_isActive_idx`(`isActive`),
    INDEX `materials_manualOrder_idx`(`manualOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
