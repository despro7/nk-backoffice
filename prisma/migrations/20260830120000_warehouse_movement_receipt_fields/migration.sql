-- AlterTable
ALTER TABLE `warehouse_movement` ADD COLUMN `submittedAt` DATETIME(3) NULL;
ALTER TABLE `warehouse_movement` ADD COLUMN `receivedBy` INTEGER NULL;
ALTER TABLE `warehouse_movement` ADD COLUMN `receivedAt` DATETIME(3) NULL;
