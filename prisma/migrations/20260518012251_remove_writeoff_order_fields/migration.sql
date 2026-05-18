/*
  Warnings:

  - You are about to drop the column `orderId` on the `warehouse_write_off_history` table. All the data in the column will be lost.
  - You are about to drop the column `orderNumber` on the `warehouse_write_off_history` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX `warehouse_write_off_history_orderId_idx` ON `warehouse_write_off_history`;

-- AlterTable
ALTER TABLE `warehouse_write_off_history` DROP COLUMN `orderId`,
    DROP COLUMN `orderNumber`;
