-- AlterTable
ALTER TABLE `catalog_goods` ADD COLUMN `fullDescription` TEXT NULL;

-- CreateTable
CREATE TABLE `catalog_good_images` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `goodId` VARCHAR(32) NOT NULL,
    `fileName` VARCHAR(255) NOT NULL,
    `originalName` VARCHAR(512) NOT NULL,
    `mimeType` VARCHAR(128) NOT NULL,
    `size` INTEGER NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isPrimary` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `catalog_good_images_goodId_idx`(`goodId`),
    INDEX `catalog_good_images_goodId_sortOrder_idx`(`goodId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `catalog_good_images` ADD CONSTRAINT `catalog_good_images_goodId_fkey` FOREIGN KEY (`goodId`) REFERENCES `catalog_goods`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
