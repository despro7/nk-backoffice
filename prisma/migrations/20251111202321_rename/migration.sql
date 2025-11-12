/*
  Warnings:

  - You are about to drop the column `dilovodExportError` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `dilovodExportStatus` on the `orders` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX `orders_dilovodExportStatus_idx` ON `orders`;

-- AlterTable
ALTER TABLE `orders` DROP COLUMN `dilovodExportError`,
    DROP COLUMN `dilovodExportStatus`,
    ADD COLUMN `dilovodCashInDate` DATETIME(3) NULL,
    ADD COLUMN `dilovodSaleExportDate` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `orders_dilovodSaleExportDate_idx` ON `orders`(`dilovodSaleExportDate`);
