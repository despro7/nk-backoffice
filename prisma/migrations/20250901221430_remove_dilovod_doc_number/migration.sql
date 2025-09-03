/*
  Warnings:

  - You are about to drop the column `dilovodDocNumber` on the `warehouse_movement` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `warehouse_movement` DROP COLUMN `dilovodDocNumber`,
    MODIFY `internalDocNumber` VARCHAR(191) NOT NULL DEFAULT '00001';
