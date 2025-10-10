-- AlterTable
ALTER TABLE `products` ADD COLUMN `isOutdated` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX `products_isOutdated_idx` ON `products`(`isOutdated`);
