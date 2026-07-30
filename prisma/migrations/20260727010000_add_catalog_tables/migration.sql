-- CreateTable
CREATE TABLE `catalog_goods` (
    `id` VARCHAR(32) NOT NULL,
    `parentId` VARCHAR(32) NULL,
    `isGroup` BOOLEAN NOT NULL DEFAULT false,
    `delMark` BOOLEAN NOT NULL DEFAULT false,
    `name` VARCHAR(512) NOT NULL,
    `sku` VARCHAR(64) NULL,
    `mainUnitId` VARCHAR(32) NULL,
    `packageRatio` DOUBLE NULL,
    `weight` DOUBLE NULL,
    `accPolicyId` VARCHAR(32) NULL,
    `printName` VARCHAR(512) NULL,
    `description` TEXT NULL,
    `syncedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `catalog_goods_sku_key`(`sku`),
    INDEX `catalog_goods_parentId_idx`(`parentId`),
    INDEX `catalog_goods_isGroup_idx`(`isGroup`),
    INDEX `catalog_goods_delMark_idx`(`delMark`),
    INDEX `catalog_goods_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `catalog_good_components` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `parentGoodId` VARCHAR(32) NOT NULL,
    `componentGoodId` VARCHAR(32) NOT NULL,
    `qty` DOUBLE NOT NULL DEFAULT 1,
    `rowNum` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `catalog_good_components_parentGoodId_idx`(`parentGoodId`),
    INDEX `catalog_good_components_componentGoodId_idx`(`componentGoodId`),
    UNIQUE INDEX `catalog_good_components_parentGoodId_componentGoodId_key`(`parentGoodId`, `componentGoodId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `catalog_good_prices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `goodId` VARCHAR(32) NOT NULL,
    `priceType` VARCHAR(32) NOT NULL,
    `price` DOUBLE NOT NULL DEFAULT 0,
    `currency` VARCHAR(16) NULL,
    `syncedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `catalog_good_prices_goodId_idx`(`goodId`),
    UNIQUE INDEX `catalog_good_prices_goodId_priceType_key`(`goodId`, `priceType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `catalog_good_barcodes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `goodId` VARCHAR(32) NOT NULL,
    `dilovodRegisterId` VARCHAR(32) NULL,
    `code` VARCHAR(64) NOT NULL,
    `goodPart` VARCHAR(32) NOT NULL DEFAULT '',
    `goodPartName` VARCHAR(255) NULL,
    `activity` BOOLEAN NOT NULL DEFAULT true,
    `syncedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `catalog_good_barcodes_goodId_idx`(`goodId`),
    INDEX `catalog_good_barcodes_code_idx`(`code`),
    INDEX `catalog_good_barcodes_goodPart_idx`(`goodPart`),
    UNIQUE INDEX `catalog_good_barcodes_goodId_code_goodPart_key`(`goodId`, `code`, `goodPart`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `catalog_good_components` ADD CONSTRAINT `catalog_good_components_parentGoodId_fkey` FOREIGN KEY (`parentGoodId`) REFERENCES `catalog_goods`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `catalog_good_components` ADD CONSTRAINT `catalog_good_components_componentGoodId_fkey` FOREIGN KEY (`componentGoodId`) REFERENCES `catalog_goods`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `catalog_good_prices` ADD CONSTRAINT `catalog_good_prices_goodId_fkey` FOREIGN KEY (`goodId`) REFERENCES `catalog_goods`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `catalog_good_barcodes` ADD CONSTRAINT `catalog_good_barcodes_goodId_fkey` FOREIGN KEY (`goodId`) REFERENCES `catalog_goods`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
