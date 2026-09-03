-- HR: місяць табеля + клітинки (зайнятість × дата)
CREATE TABLE `hr_timesheet_months` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'draft',
    `version` INTEGER NOT NULL DEFAULT 1,
    `normWorkDays` INTEGER NOT NULL,
    `normHours` DECIMAL(6, 2) NOT NULL,
    `lockedByUserId` INTEGER NULL,
    `lockedUntil` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `hr_timesheet_months_year_month_key` (`year`, `month`),
    INDEX `hr_timesheet_months_status_idx` (`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `hr_timesheet_entries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `monthId` INTEGER NOT NULL,
    `employmentId` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `kind` VARCHAR(8) NOT NULL,
    `hours` DECIMAL(6, 2) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `hr_timesheet_entries_monthId_employmentId_date_key` (`monthId`, `employmentId`, `date`),
    INDEX `hr_timesheet_entries_employmentId_idx` (`employmentId`),
    INDEX `hr_timesheet_entries_monthId_idx` (`monthId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `hr_timesheet_months` ADD CONSTRAINT `hr_timesheet_months_lockedByUserId_fkey` FOREIGN KEY (`lockedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `hr_timesheet_entries` ADD CONSTRAINT `hr_timesheet_entries_monthId_fkey` FOREIGN KEY (`monthId`) REFERENCES `hr_timesheet_months`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `hr_timesheet_entries` ADD CONSTRAINT `hr_timesheet_entries_employmentId_fkey` FOREIGN KEY (`employmentId`) REFERENCES `hr_employments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
