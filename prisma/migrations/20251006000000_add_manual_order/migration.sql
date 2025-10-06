-- Add manualOrder column and index to products
ALTER TABLE `products`
  ADD COLUMN `manualOrder` INT NOT NULL DEFAULT 0;

CREATE INDEX `products_manualOrder_idx` ON `products`(`manualOrder`);

