-- AlterTable
ALTER TABLE `catalog_product_label_drafts`
  ADD COLUMN `updatedBy` INTEGER NULL AFTER `payloadJson`;

-- AddForeignKey
ALTER TABLE `catalog_product_label_drafts`
  ADD CONSTRAINT `catalog_product_label_drafts_updatedBy_fkey`
  FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
