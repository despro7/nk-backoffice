-- Snapshot відправлених / отриманих кількостей для вікна редагування та threshold
ALTER TABLE `warehouse_movement` ADD COLUMN `submittedItemsSnapshot` LONGTEXT NULL;
ALTER TABLE `warehouse_movement` ADD COLUMN `receivedItemsSnapshot` LONGTEXT NULL;
