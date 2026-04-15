/*
  Warnings:

  - You are about to drop the column `createdAt` on the `warehouse_movement` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `warehouse_movement` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `users` ADD COLUMN `dilovodUserId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `warehouse_movement` DROP COLUMN `createdAt`,
    DROP COLUMN `updatedAt`,
    ADD COLUMN `dilovodDocId` VARCHAR(191) NULL,
    ADD COLUMN `docNumber` VARCHAR(191) NULL;
