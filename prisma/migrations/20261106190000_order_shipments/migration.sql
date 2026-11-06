-- Shipment cycles per order: composition of every shipment, linked to Dilovod sale / saleReturn documents.

-- CreateTable
CREATE TABLE `order_shipments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderId` INTEGER NOT NULL,
    `cycle` INTEGER NOT NULL,
    `pickedAt` DATETIME(3) NOT NULL,
    `pickedById` INTEGER NULL,
    `source` VARCHAR(16) NOT NULL,
    `schemaVersion` INTEGER NOT NULL,
    `summary` JSON NOT NULL,
    `manifest` JSON NULL,
    `saleDocumentId` INTEGER NULL,
    `returnDocumentId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `order_shipments_saleDocumentId_key`(`saleDocumentId`),
    UNIQUE INDEX `order_shipments_returnDocumentId_key`(`returnDocumentId`),
    INDEX `order_shipments_pickedAt_idx`(`pickedAt`),
    UNIQUE INDEX `order_shipments_orderId_cycle_key`(`orderId`, `cycle`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `order_shipments` ADD CONSTRAINT `order_shipments_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_shipments` ADD CONSTRAINT `order_shipments_saleDocumentId_fkey` FOREIGN KEY (`saleDocumentId`) REFERENCES `order_dilovod_documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_shipments` ADD CONSTRAINT `order_shipments_returnDocumentId_fkey` FOREIGN KEY (`returnDocumentId`) REFERENCES `order_dilovod_documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

