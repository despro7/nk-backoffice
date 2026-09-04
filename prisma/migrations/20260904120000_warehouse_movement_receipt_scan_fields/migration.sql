-- AlterTable
ALTER TABLE `warehouse_movement` ADD COLUMN `receiptScanStartedAt` DATETIME(3) NULL;
ALTER TABLE `warehouse_movement` ADD COLUMN `receiptScanEndedAt` DATETIME(3) NULL;
ALTER TABLE `warehouse_movement` ADD COLUMN `receiptScannedBy` INTEGER NULL;
