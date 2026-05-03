/*
  Warnings:

  - You are about to drop the column `orderDate` on the `warehouse_return_history` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `warehouse_return_history` DROP COLUMN `orderDate`,
    ADD COLUMN `returnDate` DATETIME(3) NULL;
