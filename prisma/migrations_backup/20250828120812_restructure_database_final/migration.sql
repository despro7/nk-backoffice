/*
  Warnings:

  - You are about to drop the `DilovodData` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Order` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `OrderHistory` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Product` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SalesDriveData` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `refresh_tokens` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `OrderHistory` DROP FOREIGN KEY `OrderHistory_orderId_fkey`;

-- DropForeignKey
ALTER TABLE `OrderHistory` DROP FOREIGN KEY `OrderHistory_userId_fkey`;

-- DropForeignKey
ALTER TABLE `refresh_tokens` DROP FOREIGN KEY `refresh_tokens_userId_fkey`;

-- DropTable
DROP TABLE `DilovodData`;

-- DropTable
DROP TABLE `Order`;

-- DropTable
DROP TABLE `OrderHistory`;

-- DropTable
DROP TABLE `Product`;

-- DropTable
DROP TABLE `SalesDriveData`;

-- DropTable
DROP TABLE `User`;

-- DropTable
DROP TABLE `refresh_tokens`;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `role` VARCHAR(191) NOT NULL,
    `roleName` VARCHAR(191) NULL,
    `password` VARCHAR(191) NOT NULL,
    `refreshToken` VARCHAR(191) NULL,
    `refreshTokenExpiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastActivityAt` DATETIME(3) NULL,
    `lastLoginAt` DATETIME(3) NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orders` (
    `id` VARCHAR(191) NOT NULL,
    `externalId` VARCHAR(191) NOT NULL,
    `ttn` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `items` JSON NOT NULL,
    `rawData` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `cityName` VARCHAR(191) NULL,
    `customerName` VARCHAR(191) NULL,
    `customerPhone` VARCHAR(191) NULL,
    `deliveryAddress` VARCHAR(191) NULL,
    `lastSynced` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `orderDate` DATETIME(3) NULL,
    `orderNumber` VARCHAR(191) NOT NULL,
    `paymentMethod` VARCHAR(191) NULL,
    `provider` VARCHAR(191) NULL,
    `shippingMethod` VARCHAR(191) NULL,
    `statusText` VARCHAR(191) NOT NULL,
    `syncError` VARCHAR(191) NULL,
    `syncStatus` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `totalPrice` DOUBLE NULL,

    UNIQUE INDEX `orders_externalId_key`(`externalId`),
    INDEX `orders_status_idx`(`status`),
    INDEX `orders_externalId_idx`(`externalId`),
    INDEX `orders_lastSynced_idx`(`lastSynced`),
    INDEX `orders_syncStatus_idx`(`syncStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orders_history` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `statusText` VARCHAR(191) NOT NULL,
    `changedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `source` VARCHAR(191) NOT NULL,
    `userId` INTEGER NULL,
    `notes` VARCHAR(191) NULL,

    INDEX `orders_history_orderId_idx`(`orderId`),
    INDEX `orders_history_changedAt_idx`(`changedAt`),
    INDEX `orders_history_source_idx`(`source`),
    INDEX `orders_history_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
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
    `weight` INTEGER NULL,

    UNIQUE INDEX `products_sku_key`(`sku`),
    INDEX `products_sku_idx`(`sku`),
    INDEX `products_categoryId_idx`(`categoryId`),
    INDEX `products_lastSyncAt_idx`(`lastSyncAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `orders_history` ADD CONSTRAINT `orders_history_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders_history` ADD CONSTRAINT `orders_history_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
