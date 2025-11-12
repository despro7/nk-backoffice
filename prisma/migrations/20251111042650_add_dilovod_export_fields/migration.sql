-- AlterTable
ALTER TABLE `orders` ADD COLUMN `dilovodExportDate` DATETIME(3) NULL,
    ADD COLUMN `dilovodExportError` VARCHAR(191) NULL,
    ADD COLUMN `dilovodExportStatus` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `orders_dilovodExportStatus_idx` ON `orders`(`dilovodExportStatus`);
