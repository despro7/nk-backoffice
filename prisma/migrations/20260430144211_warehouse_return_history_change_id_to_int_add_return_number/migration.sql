/*
  Warnings:

  - The primary key for the `warehouse_return_history` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `warehouse_return_history` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.

*/
-- AlterTable
ALTER TABLE `warehouse_return_history` DROP PRIMARY KEY,
    ADD COLUMN `returnNumber` VARCHAR(255) NULL,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    ADD PRIMARY KEY (`id`);

-- CreateIndex
CREATE INDEX `warehouse_return_history_returnNumber_idx` ON `warehouse_return_history`(`returnNumber`);
