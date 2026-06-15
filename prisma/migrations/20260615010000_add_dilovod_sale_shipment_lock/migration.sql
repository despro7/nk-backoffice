-- Add DB lock fields for idempotent Dilovod sale shipment creation
ALTER TABLE `orders`
  ADD COLUMN `dilovodSaleExportLockUntil` DATETIME(3) NULL AFTER `dilovodSaleDocsCount`,
  ADD COLUMN `dilovodSaleExportLockToken` VARCHAR(64) NULL AFTER `dilovodSaleExportLockUntil`;

CREATE INDEX `orders_dilovodSaleExportLockUntil_idx` ON `orders` (`dilovodSaleExportLockUntil`);
