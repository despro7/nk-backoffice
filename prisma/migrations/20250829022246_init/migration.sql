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
    `items` LONGTEXT NOT NULL,
    `rawData` LONGTEXT NOT NULL,
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
    `set` LONGTEXT NULL,
    `additionalPrices` LONGTEXT NULL,
    `stockBalanceByStock` LONGTEXT NULL,
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

-- CreateTable
CREATE TABLE `settings_boxes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `marking` VARCHAR(191) NOT NULL,
    `qntFrom` INTEGER NOT NULL,
    `qntTo` INTEGER NOT NULL,
    `width` INTEGER NOT NULL,
    `height` INTEGER NOT NULL,
    `length` INTEGER NOT NULL,
    `overflow` INTEGER NOT NULL DEFAULT 1,
    `weight` DECIMAL(10, 2) NOT NULL,
    `self_weight` DECIMAL(10, 2) NOT NULL,
    `description` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `settings_boxes_isActive_idx`(`isActive`),
    INDEX `settings_boxes_marking_idx`(`marking`),
    INDEX `settings_boxes_qntFrom_idx`(`qntFrom`),
    INDEX `settings_boxes_qntTo_idx`(`qntTo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings_base` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(255) NOT NULL,
    `value` TEXT NOT NULL,
    `description` TEXT NULL,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` TIMESTAMP(3) NOT NULL,

    UNIQUE INDEX `settings_base_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings_wp_sku` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `skus` LONGTEXT NOT NULL,
    `lastUpdated` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `totalCount` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `orders_history` ADD CONSTRAINT `orders_history_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders_history` ADD CONSTRAINT `orders_history_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
