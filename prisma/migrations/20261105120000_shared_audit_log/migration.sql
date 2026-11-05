-- Generalize hr_audit_log into shared audit_log (HR, Warehouse, Catalog…)

-- DropForeignKey
ALTER TABLE `hr_audit_log` DROP FOREIGN KEY `hr_audit_log_userId_fkey`;

-- DropIndex
DROP INDEX `hr_audit_log_entityType_entityId_idx` ON `hr_audit_log`;
DROP INDEX `hr_audit_log_createdAt_idx` ON `hr_audit_log`;

-- RenameTable (data preserved)
RENAME TABLE `hr_audit_log` TO `audit_log`;

-- AlterTable: entityId INT -> VARCHAR (existing ids converted to strings), add source
ALTER TABLE `audit_log`
    MODIFY `entityId` VARCHAR(64) NOT NULL,
    ADD COLUMN `source` VARCHAR(16) NOT NULL DEFAULT 'ui';

-- CreateIndex
CREATE INDEX `audit_log_entityType_entityId_createdAt_idx` ON `audit_log`(`entityType`, `entityId`, `createdAt`);
CREATE INDEX `audit_log_entityType_createdAt_idx` ON `audit_log`(`entityType`, `createdAt`);
CREATE INDEX `audit_log_userId_createdAt_idx` ON `audit_log`(`userId`, `createdAt`);
CREATE INDEX `audit_log_createdAt_idx` ON `audit_log`(`createdAt`);

-- AddForeignKey
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
