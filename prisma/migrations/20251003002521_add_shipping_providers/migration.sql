-- CreateTable
CREATE TABLE `shipping_providers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `providerType` VARCHAR(20) NOT NULL,
    `senderName` VARCHAR(200) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT false,
    `apiKey` VARCHAR(500) NULL,
    `bearerEcom` VARCHAR(500) NULL,
    `counterpartyToken` VARCHAR(500) NULL,
    `bearerStatus` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `shipping_providers_providerType_idx`(`providerType`),
    INDEX `shipping_providers_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
