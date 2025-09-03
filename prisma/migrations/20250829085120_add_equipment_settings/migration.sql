-- AlterTable
ALTER TABLE `settings_base` ADD COLUMN `category` VARCHAR(100) NULL,
    ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX `settings_base_category_idx` ON `settings_base`(`category`);

-- CreateIndex
CREATE INDEX `settings_base_isActive_idx` ON `settings_base`(`isActive`);
