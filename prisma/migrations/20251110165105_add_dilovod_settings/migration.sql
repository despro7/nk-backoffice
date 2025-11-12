-- CreateTable
CREATE TABLE `settings_dilovod` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `apiKey` VARCHAR(500) NULL,
    `consumerKey` VARCHAR(500) NULL,
    `consumerSecret` VARCHAR(500) NULL,
    `storageIdsList` TEXT NULL,
    `storageId` VARCHAR(100) NULL,
    `synchronizationInterval` VARCHAR(50) NOT NULL DEFAULT 'daily',
    `synchronizationRegularPrice` BOOLEAN NOT NULL DEFAULT false,
    `synchronizationSalePrice` BOOLEAN NOT NULL DEFAULT false,
    `synchronizationStockQuantity` BOOLEAN NOT NULL DEFAULT false,
    `autoSendOrder` BOOLEAN NOT NULL DEFAULT false,
    `cronSendOrder` BOOLEAN NOT NULL DEFAULT false,
    `autoSendListSettings` TEXT NULL,
    `unloadOrderNumberAs` VARCHAR(50) NOT NULL DEFAULT 'dilovod',
    `prefixOrder` VARCHAR(100) NULL,
    `sufixOrder` VARCHAR(100) NULL,
    `unloadOrderAs` VARCHAR(50) NOT NULL DEFAULT 'sale',
    `getPersonBy` VARCHAR(100) NOT NULL DEFAULT 'end_user',
    `defaultFirmId` VARCHAR(100) NULL,
    `paymentGatewayMapping` TEXT NULL,
    `logSendOrder` BOOLEAN NOT NULL DEFAULT false,
    `liqpayCommission` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
