-- AlterTable
ALTER TABLE `orders` ADD COLUMN `readyToShipAt` DATETIME(3) NULL AFTER `updatedAt`;
