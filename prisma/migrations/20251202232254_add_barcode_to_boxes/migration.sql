-- AlterTable
ALTER TABLE `settings_boxes` ADD COLUMN `barcode` VARCHAR(255) NULL;

-- CreateIndex
CREATE INDEX `settings_boxes_barcode_idx` ON `settings_boxes`(`barcode`);
