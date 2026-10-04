-- AlterTable
ALTER TABLE `warehouse_release_set` ADD COLUMN `internalDocNumber` VARCHAR(32) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `warehouse_release_set_internalDocNumber_key` ON `warehouse_release_set`(`internalDocNumber`);
