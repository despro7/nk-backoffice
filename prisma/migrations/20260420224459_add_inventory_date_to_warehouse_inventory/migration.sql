-- AlterTable
ALTER TABLE `warehouse_inventory` ADD COLUMN `inventoryDate` DATETIME(3) NULL;

-- RedefineIndex
CREATE INDEX `warehouse_inventory_createdAt_idx` ON `warehouse_inventory`(`createdAt`);
DROP INDEX `inventory_sessions_createdAt_idx` ON `warehouse_inventory`;

-- RedefineIndex
CREATE INDEX `warehouse_inventory_createdBy_idx` ON `warehouse_inventory`(`createdBy`);
DROP INDEX `inventory_sessions_createdBy_idx` ON `warehouse_inventory`;

-- RedefineIndex
CREATE INDEX `warehouse_inventory_status_idx` ON `warehouse_inventory`(`status`);
DROP INDEX `inventory_sessions_status_idx` ON `warehouse_inventory`;

-- RedefineIndex
CREATE INDEX `warehouse_inventory_warehouse_idx` ON `warehouse_inventory`(`warehouse`);
DROP INDEX `inventory_sessions_warehouse_idx` ON `warehouse_inventory`;
