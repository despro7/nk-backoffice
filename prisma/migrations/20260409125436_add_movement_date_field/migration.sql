-- AlterTable
ALTER TABLE `warehouse_movement` ADD COLUMN `movementDate` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `warehouse_movement_movementDate_idx` ON `warehouse_movement`(`movementDate`);
