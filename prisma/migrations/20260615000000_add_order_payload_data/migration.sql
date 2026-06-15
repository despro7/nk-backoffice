ALTER TABLE `orders`
  ADD COLUMN `payloadData` JSON NULL AFTER `rawData`;
