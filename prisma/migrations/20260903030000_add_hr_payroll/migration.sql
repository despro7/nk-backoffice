-- HR: місячний розрахунок виплат, рядки зі знімком, тижневі виплати
CREATE TABLE `hr_payroll_periods` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'draft',
    `version` INTEGER NOT NULL DEFAULT 1,
    `formulaId` VARCHAR(64) NOT NULL,
    `formulaSnapshot` JSON NOT NULL,
    `timesheetMonthId` INTEGER NULL,
    `lockedAt` DATETIME(3) NULL,
    `lockedByUserId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `hr_payroll_periods_year_month_key` (`year`, `month`),
    INDEX `hr_payroll_periods_status_idx` (`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `hr_payroll_lines` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `periodId` INTEGER NOT NULL,
    `employmentId` INTEGER NOT NULL,
    `payGroup` VARCHAR(32) NOT NULL,
    `formulaId` VARCHAR(64) NOT NULL,
    `rate` DECIMAL(12, 2) NOT NULL,
    `rateKind` VARCHAR(16) NOT NULL,
    `normHours` DECIMAL(6, 2) NOT NULL,
    `hoursByKind` JSON NOT NULL,
    `ratesUsed` JSON NOT NULL,
    `weekAmounts` JSON NOT NULL,
    `breakdown` JSON NOT NULL,
    `accruedAmount` DECIMAL(12, 2) NOT NULL,
    `extraAmount` DECIMAL(12, 2) NOT NULL,
    `toPayAmount` DECIMAL(12, 2) NOT NULL,
    `skipReason` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `hr_payroll_lines_periodId_employmentId_key` (`periodId`, `employmentId`),
    INDEX `hr_payroll_lines_employmentId_idx` (`employmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `hr_payouts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `periodId` INTEGER NOT NULL,
    `employmentId` INTEGER NOT NULL,
    `weekId` VARCHAR(16) NULL,
    `kind` VARCHAR(16) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `paidAt` DATETIME(3) NULL,
    `note` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `hr_payouts_periodId_idx` (`periodId`),
    INDEX `hr_payouts_employmentId_idx` (`employmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `hr_payroll_periods` ADD CONSTRAINT `hr_payroll_periods_timesheetMonthId_fkey` FOREIGN KEY (`timesheetMonthId`) REFERENCES `hr_timesheet_months`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `hr_payroll_periods` ADD CONSTRAINT `hr_payroll_periods_lockedByUserId_fkey` FOREIGN KEY (`lockedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `hr_payroll_lines` ADD CONSTRAINT `hr_payroll_lines_periodId_fkey` FOREIGN KEY (`periodId`) REFERENCES `hr_payroll_periods`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `hr_payroll_lines` ADD CONSTRAINT `hr_payroll_lines_employmentId_fkey` FOREIGN KEY (`employmentId`) REFERENCES `hr_employments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `hr_payouts` ADD CONSTRAINT `hr_payouts_periodId_fkey` FOREIGN KEY (`periodId`) REFERENCES `hr_payroll_periods`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `hr_payouts` ADD CONSTRAINT `hr_payouts_employmentId_fkey` FOREIGN KEY (`employmentId`) REFERENCES `hr_employments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
