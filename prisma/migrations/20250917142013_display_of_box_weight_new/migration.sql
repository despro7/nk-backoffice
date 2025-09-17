/*
  Warnings:

  - You are about to alter the column `self_weight` on the `settings_boxes` table. The data in that column could be lost. The data in that column will be cast from `Decimal(10,2)` to `Decimal(10,3)`.

*/
-- AlterTable
ALTER TABLE `settings_boxes` MODIFY `self_weight` DECIMAL(10, 3) NOT NULL;
