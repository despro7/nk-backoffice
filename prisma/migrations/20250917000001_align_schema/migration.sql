CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191),
    `role` VARCHAR(191) NOT NULL,
    `roleName` VARCHAR(191),
    `password` VARCHAR(191) NOT NULL,
    `refreshToken` VARCHAR(191),
    `refreshTokenExpiresAt` DATETIME(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastActivityAt` DATETIME(3),
    `lastLoginAt` DATETIME(3),

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `orders` (
    `id` INTEGER NOT NULL,
    `externalId` VARCHAR(191) NOT NULL,
    `orderDate` DATETIME(3),
    `quantity` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `statusText` VARCHAR(191) NOT NULL,
    `items` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `cityName` VARCHAR(191),
    `customerName` VARCHAR(191),
    `customerPhone` VARCHAR(191),
    `provider` VARCHAR(191),
    `ttn` VARCHAR(191) NOT NULL,
    `sajt` VARCHAR(191),
    `pricinaZnizki` VARCHAR(191),
    `rawData` LONGTEXT NOT NULL,
    `deliveryAddress` VARCHAR(191),
    `lastSynced` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `orderNumber` VARCHAR(191) NOT NULL,
    `paymentMethod` VARCHAR(191),
    `shippingMethod` VARCHAR(191),
    `totalPrice` DOUBLE,
    `syncError` VARCHAR(191),
    `syncStatus` VARCHAR(191) NOT NULL DEFAULT 'pending',

    UNIQUE INDEX `orders_externalId_key`(`externalId`),
    INDEX `orders_status_idx`(`status`),
    INDEX `orders_externalId_idx`(`externalId`),
    INDEX `orders_lastSynced_idx`(`lastSynced`),
    INDEX `orders_syncStatus_idx`(`syncStatus`),
    INDEX `orders_createdAt_idx`(`createdAt`),
    INDEX `orders_orderDate_idx`(`orderDate`),
    INDEX `orders_orderNumber_idx`(`orderNumber`),
    INDEX `orders_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `orders_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderId` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `statusText` VARCHAR(191) NOT NULL,
    `changedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `source` VARCHAR(191) NOT NULL,
    `userId` INTEGER,
    `notes` VARCHAR(191),

    INDEX `orders_history_orderId_idx`(`orderId`),
    INDEX `orders_history_changedAt_idx`(`changedAt`),
    INDEX `orders_history_source_idx`(`source`),
    INDEX `orders_history_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sku` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `costPerItem` DOUBLE,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'UAH',
    `categoryId` INTEGER,
    `categoryName` VARCHAR(191),
    `set` LONGTEXT,
    `additionalPrices` LONGTEXT,
    `stockBalanceByStock` LONGTEXT,
    `dilovodId` VARCHAR(191),
    `parent` VARCHAR(191),
    `lastSyncAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `weight` INTEGER,

    UNIQUE INDEX `products_sku_key`(`sku`),
    INDEX `products_sku_idx`(`sku`),
    INDEX `products_categoryId_idx`(`categoryId`),
    INDEX `products_lastSyncAt_idx`(`lastSyncAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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
    `description` VARCHAR(191),
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `settings_boxes_isActive_idx`(`isActive`),
    INDEX `settings_boxes_marking_idx`(`marking`),
    INDEX `settings_boxes_qntFrom_idx`(`qntFrom`),
    INDEX `settings_boxes_qntTo_idx`(`qntTo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `settings_base` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(255) NOT NULL,
    `value` TEXT NOT NULL,
    `description` TEXT,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` TIMESTAMP(3) NOT NULL,
    `category` VARCHAR(100),
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `settings_base_key_key`(`key`),
    INDEX `settings_base_category_idx`(`category`),
    INDEX `settings_base_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `settings_wp_sku` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `skus` LONGTEXT NOT NULL,
    `lastUpdated` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `totalCount` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `warehouse_movement` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `draftCreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `draftLastEditedAt` DATETIME(3) NOT NULL,
    `sentToDilovodAt` DATETIME(3),
    `internalDocNumber` VARCHAR(191) NOT NULL DEFAULT '00001',
    `items` LONGTEXT NOT NULL,
    `deviations` LONGTEXT,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `sourceWarehouse` VARCHAR(191) NOT NULL,
    `destinationWarehouse` VARCHAR(191) NOT NULL,
    `notes` VARCHAR(191),
    `createdBy` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `warehouse_movement_internalDocNumber_key`(`internalDocNumber`),
    INDEX `warehouse_movement_status_idx`(`status`),
    INDEX `warehouse_movement_draftCreatedAt_idx`(`draftCreatedAt`),
    INDEX `warehouse_movement_sentToDilovodAt_idx`(`sentToDilovodAt`),
    INDEX `warehouse_movement_sourceWarehouse_idx`(`sourceWarehouse`),
    INDEX `warehouse_movement_destinationWarehouse_idx`(`destinationWarehouse`),
    INDEX `warehouse_movement_createdBy_idx`(`createdBy`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `stock_movement_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productSku` VARCHAR(191) NOT NULL,
    `warehouse` VARCHAR(191) NOT NULL,
    `movementType` VARCHAR(191) NOT NULL,
    `quantity` DOUBLE NOT NULL,
    `quantityType` VARCHAR(191) NOT NULL,
    `batchNumber` VARCHAR(191),
    `referenceId` VARCHAR(191),
    `referenceType` VARCHAR(191),
    `previousBalance` DOUBLE NOT NULL,
    `newBalance` DOUBLE NOT NULL,
    `movementDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `notes` VARCHAR(191),
    `createdBy` INTEGER,

    INDEX `stock_movement_history_productSku_idx`(`productSku`),
    INDEX `stock_movement_history_warehouse_idx`(`warehouse`),
    INDEX `stock_movement_history_movementType_idx`(`movementType`),
    INDEX `stock_movement_history_movementDate_idx`(`movementDate`),
    INDEX `stock_movement_history_referenceId_idx`(`referenceId`),
    INDEX `stock_movement_history_referenceType_idx`(`referenceType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `sync_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `details` LONGTEXT,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3),
    `duration` BIGINT,
    `recordsProcessed` INTEGER,
    `errors` LONGTEXT,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `sync_logs_type_idx`(`type`),
    INDEX `sync_logs_status_idx`(`status`),
    INDEX `sync_logs_startedAt_idx`(`startedAt`),
    INDEX `sync_logs_finishedAt_idx`(`finishedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `sync_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `syncType` VARCHAR(191) NOT NULL,
    `startDate` VARCHAR(191),
    `endDate` VARCHAR(191),
    `totalOrders` INTEGER NOT NULL,
    `newOrders` INTEGER NOT NULL,
    `updatedOrders` INTEGER NOT NULL,
    `skippedOrders` INTEGER NOT NULL,
    `errors` INTEGER NOT NULL,
    `duration` DOUBLE NOT NULL,
    `details` LONGTEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `errorMessage` VARCHAR(191),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `orders_cache` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `externalId` VARCHAR(191) NOT NULL,
    `processedItems` LONGTEXT,
    `totalQuantity` INTEGER NOT NULL,
    `cacheUpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `cacheVersion` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `orders_cache_externalId_key`(`externalId`),
    INDEX `orders_cache_externalId_idx`(`externalId`),
    INDEX `orders_cache_cacheUpdatedAt_idx`(`cacheUpdatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `orders_history` ADD CONSTRAINT `orders_history_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `orders_history` ADD CONSTRAINT `orders_history_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
