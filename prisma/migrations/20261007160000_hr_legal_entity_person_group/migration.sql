-- AlterTable
ALTER TABLE `hr_legal_entities` ADD COLUMN `dilovodPersonGroupId` VARCHAR(32) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `hr_legal_entities_dilovodPersonGroupId_key` ON `hr_legal_entities`(`dilovodPersonGroupId`);
