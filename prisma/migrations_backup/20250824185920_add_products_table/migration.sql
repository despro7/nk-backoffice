-- CreateTable
CREATE TABLE `Order` (
    `id` VARCHAR(191) NOT NULL,
    `externalId` VARCHAR(191) NOT NULL,
    `ttn` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `items` JSON NOT NULL,
    `rawData` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Order_externalId_key`(`externalId`),
    INDEX `Order_status_idx`(`status`),
    INDEX `Order_externalId_idx`(`externalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Product` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sku` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `costPerItem` DOUBLE NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'UAH',
    `categoryId` INTEGER NULL,
    `categoryName` VARCHAR(191) NULL,
    `set` JSON NULL,
    `additionalPrices` JSON NULL,
    `stockBalanceByStock` JSON NULL,
    `dilovodId` VARCHAR(191) NULL,
    `parent` VARCHAR(191) NULL,
    `lastSyncAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Product_sku_key`(`sku`),
    INDEX `Product_sku_idx`(`sku`),
    INDEX `Product_categoryId_idx`(`categoryId`),
    INDEX `Product_lastSyncAt_idx`(`lastSyncAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
