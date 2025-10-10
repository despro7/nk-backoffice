-- AlterTable
ALTER TABLE `products` ADD COLUMN `dilovodDataHash` VARCHAR(64) NULL,
    MODIFY `manualOrder` INTEGER NULL DEFAULT 0;
