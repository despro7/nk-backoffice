-- AlterTable
ALTER TABLE `meta_logs` ADD COLUMN `initiatedBy` VARCHAR(128) NULL;

-- CreateIndex
CREATE INDEX `meta_logs_initiatedBy_idx` ON `meta_logs`(`initiatedBy`);
