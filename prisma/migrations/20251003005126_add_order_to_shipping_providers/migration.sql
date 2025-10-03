-- AlterTable
ALTER TABLE `shipping_providers` ADD COLUMN `order` INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX `shipping_providers_order_idx` ON `shipping_providers`(`order`);
