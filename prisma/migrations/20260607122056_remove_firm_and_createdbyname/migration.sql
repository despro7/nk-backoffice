/*
  Warnings:

  - You are about to drop the column `createdByName` on the `warehouse_release_set` table. All the data in the column will be lost.
  - You are about to drop the column `createdByName` on the `warehouse_return_history` table. All the data in the column will be lost.
  - You are about to drop the column `firmName` on the `warehouse_return_history` table. All the data in the column will be lost.
  - You are about to drop the column `createdByName` on the `warehouse_write_off_history` table. All the data in the column will be lost.
  - You are about to drop the column `firmName` on the `warehouse_write_off_history` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `warehouse_release_set` DROP COLUMN `createdByName`;

-- AlterTable
ALTER TABLE `warehouse_return_history` DROP COLUMN `createdByName`,
    DROP COLUMN `firmName`;

-- AlterTable
ALTER TABLE `warehouse_write_off_history` DROP COLUMN `createdByName`,
    DROP COLUMN `firmName`;
