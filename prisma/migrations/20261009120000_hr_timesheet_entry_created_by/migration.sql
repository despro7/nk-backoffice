-- AlterTable
ALTER TABLE `hr_timesheet_entries` ADD COLUMN `createdByUserId` INTEGER NULL;

-- CreateIndex
CREATE INDEX `hr_timesheet_entries_createdByUserId_idx` ON `hr_timesheet_entries`(`createdByUserId`);

-- AddForeignKey
ALTER TABLE `hr_timesheet_entries` ADD CONSTRAINT `hr_timesheet_entries_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
