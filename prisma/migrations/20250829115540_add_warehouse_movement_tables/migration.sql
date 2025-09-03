-- CreateTable
CREATE TABLE `warehouse_movement` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `draftCreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `draftLastEditedAt` DATETIME(3) NOT NULL,
    `sentToDilovodAt` DATETIME(3) NULL,
    `internalDocNumber` VARCHAR(191) NOT NULL,
    `dilovodDocNumber` VARCHAR(191) NULL,
    `items` JSON NOT NULL,
    `deviations` JSON NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `sourceWarehouse` VARCHAR(191) NOT NULL,
    `destinationWarehouse` VARCHAR(191) NOT NULL,
    `notes` VARCHAR(191) NULL,
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

-- CreateTable
CREATE TABLE `stock_movement_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productSku` VARCHAR(191) NOT NULL,
    `warehouse` VARCHAR(191) NOT NULL,
    `movementType` VARCHAR(191) NOT NULL,
    `quantity` DOUBLE NOT NULL,
    `quantityType` VARCHAR(191) NOT NULL,
    `batchNumber` VARCHAR(191) NULL,
    `referenceId` VARCHAR(191) NULL,
    `referenceType` VARCHAR(191) NULL,
    `previousBalance` DOUBLE NOT NULL,
    `newBalance` DOUBLE NOT NULL,
    `movementDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `notes` VARCHAR(191) NULL,
    `createdBy` INTEGER NULL,

    INDEX `stock_movement_history_productSku_idx`(`productSku`),
    INDEX `stock_movement_history_warehouse_idx`(`warehouse`),
    INDEX `stock_movement_history_movementType_idx`(`movementType`),
    INDEX `stock_movement_history_movementDate_idx`(`movementDate`),
    INDEX `stock_movement_history_referenceId_idx`(`referenceId`),
    INDEX `stock_movement_history_referenceType_idx`(`referenceType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
