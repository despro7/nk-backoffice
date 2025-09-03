/*
  Warnings:

  - You are about to alter the column `skus` on the `settings_wp_sku` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Json`.

*/
-- AlterTable
ALTER TABLE `settings_wp_sku` MODIFY `skus` JSON NOT NULL;
