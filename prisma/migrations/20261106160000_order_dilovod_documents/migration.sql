-- Dilovod documents per order (saleOrder, cashIn, sale, saleReturn): full history of shipment cycles.

CREATE TABLE `order_dilovod_documents` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderId` INTEGER NOT NULL,
    `type` VARCHAR(32) NOT NULL,
    `dilovodId` VARCHAR(32) NOT NULL,
    `number` VARCHAR(64) NULL,
    `docDate` DATETIME(3) NOT NULL,
    `source` VARCHAR(16) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `order_dilovod_documents_dilovodId_key`(`dilovodId`),
    INDEX `order_dilovod_documents_orderId_idx`(`orderId`),
    INDEX `order_dilovod_documents_type_docDate_idx`(`type`, `docDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `order_dilovod_documents` ADD CONSTRAINT `order_dilovod_documents_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
