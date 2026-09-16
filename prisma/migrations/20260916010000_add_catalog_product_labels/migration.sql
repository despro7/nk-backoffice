-- CreateTable
CREATE TABLE `catalog_product_label_drafts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `goodId` VARCHAR(32) NOT NULL,
    `batchId` VARCHAR(32) NOT NULL,
    `labelKind` VARCHAR(16) NOT NULL,
    `batchNumber` VARCHAR(255) NOT NULL,
    `payloadJson` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `catalog_product_label_drafts_goodId_batchId_labelKind_key`(`goodId`, `batchId`, `labelKind`),
    INDEX `catalog_product_label_drafts_goodId_idx`(`goodId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `catalog_product_labels` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `goodId` VARCHAR(32) NOT NULL,
    `batchId` VARCHAR(32) NOT NULL,
    `labelKind` VARCHAR(16) NOT NULL,
    `batchNumber` VARCHAR(255) NOT NULL,
    `version` INTEGER NOT NULL,
    `barcode` VARCHAR(64) NOT NULL,
    `pdfFileName` VARCHAR(255) NOT NULL,
    `payloadJson` JSON NOT NULL,
    `publishedBy` INTEGER NULL,
    `publishedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `catalog_product_labels_goodId_batchId_labelKind_idx`(`goodId`, `batchId`, `labelKind`),
    UNIQUE INDEX `catalog_product_labels_goodId_batchId_labelKind_version_key`(`goodId`, `batchId`, `labelKind`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `catalog_product_label_drafts` ADD CONSTRAINT `catalog_product_label_drafts_goodId_fkey` FOREIGN KEY (`goodId`) REFERENCES `catalog_goods`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `catalog_product_labels` ADD CONSTRAINT `catalog_product_labels_goodId_fkey` FOREIGN KEY (`goodId`) REFERENCES `catalog_goods`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `catalog_product_labels` ADD CONSTRAINT `catalog_product_labels_publishedBy_fkey` FOREIGN KEY (`publishedBy`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
