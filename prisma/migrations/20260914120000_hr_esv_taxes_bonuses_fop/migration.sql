-- AlterTable hr_payroll_lines: tax/FOP fields
ALTER TABLE `hr_payroll_lines`
  ADD COLUMN `grossAccrued` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `netToPay` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `employerTotalCost` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `bonusAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `taxBreakdown` JSON NULL;

-- CreateTable hr_tax_rules
CREATE TABLE `hr_tax_rules` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(32) NOT NULL,
  `label` VARCHAR(128) NOT NULL,
  `rate` DECIMAL(8, 6) NOT NULL,
  `payer` VARCHAR(16) NOT NULL,
  `base` VARCHAR(16) NOT NULL,
  `payGroups` JSON NOT NULL,
  `effectiveFrom` DATE NOT NULL,
  `effectiveTo` DATE NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `hr_tax_rules_code_isActive_idx`(`code`, `isActive`),
  INDEX `hr_tax_rules_effectiveFrom_idx`(`effectiveFrom`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable hr_production_calendar
CREATE TABLE `hr_production_calendar` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `isEnabled` BOOLEAN NOT NULL DEFAULT false,
  `weekStartDay` INTEGER NOT NULL DEFAULT 1,
  `fopWeekdays` JSON NOT NULL,
  `label` VARCHAR(128) NOT NULL DEFAULT 'Стандарт пн–пт',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable hr_production_weeks
CREATE TABLE `hr_production_weeks` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `startDate` DATE NOT NULL,
  `endDate` DATE NOT NULL,
  `fopWeekdays` JSON NOT NULL,
  `label` VARCHAR(128) NOT NULL,
  `year` INTEGER NOT NULL,
  `sequence` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `hr_production_weeks_startDate_endDate_key`(`startDate`, `endDate`),
  INDEX `hr_production_weeks_year_sequence_idx`(`year`, `sequence`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable hr_bonuses
CREATE TABLE `hr_bonuses` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `employmentId` INTEGER NOT NULL,
  `productionWeekId` INTEGER NULL,
  `calendarWeekId` VARCHAR(16) NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `kind` VARCHAR(16) NOT NULL DEFAULT 'manual',
  `note` VARCHAR(255) NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'draft',
  `createdByUserId` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `hr_bonuses_employmentId_idx`(`employmentId`),
  INDEX `hr_bonuses_productionWeekId_idx`(`productionWeekId`),
  INDEX `hr_bonuses_calendarWeekId_idx`(`calendarWeekId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `hr_bonuses`
  ADD CONSTRAINT `hr_bonuses_employmentId_fkey`
    FOREIGN KEY (`employmentId`) REFERENCES `hr_employments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `hr_bonuses_productionWeekId_fkey`
    FOREIGN KEY (`productionWeekId`) REFERENCES `hr_production_weeks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default production calendar (disabled, Mon-Fri)
INSERT INTO `hr_production_calendar` (`isEnabled`, `weekStartDay`, `fopWeekdays`, `label`, `updatedAt`)
VALUES (false, 1, '[1,2,3,4,5]', 'Стандарт пн–пт', CURRENT_TIMESTAMP(3));

-- Seed default tax rules for official_salary (ESV 22%, PDFO 18%, military 5%)
INSERT INTO `hr_tax_rules` (`code`, `label`, `rate`, `payer`, `base`, `payGroups`, `effectiveFrom`, `sortOrder`, `isActive`, `updatedAt`)
VALUES
  ('esv', 'ЄСВ', 0.220000, 'employer', 'gross', '["official_salary"]', '2026-01-01', 0, true, CURRENT_TIMESTAMP(3)),
  ('pdfo', 'ПДФО', 0.180000, 'employee', 'gross', '["official_salary"]', '2026-01-01', 1, true, CURRENT_TIMESTAMP(3)),
  ('military', 'Військовий збір', 0.050000, 'employee', 'gross', '["official_salary"]', '2026-01-01', 2, true, CURRENT_TIMESTAMP(3));
