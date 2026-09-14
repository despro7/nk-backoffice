-- HrAuditLog
CREATE TABLE `hr_audit_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entityType` VARCHAR(32) NOT NULL,
    `entityId` INTEGER NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `userId` INTEGER NULL,
    `payload` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `hr_audit_log_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `hr_audit_log_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `hr_audit_log` ADD CONSTRAINT `hr_audit_log_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- HrPayGroup
CREATE TABLE `hr_pay_groups` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(32) NOT NULL,
    `label` VARCHAR(64) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `formulaProfile` VARCHAR(32) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `hr_pay_groups_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `hr_pay_groups` (`slug`, `label`, `sortOrder`, `isActive`, `formulaProfile`, `createdAt`, `updatedAt`) VALUES
('official_salary', 'Офіційна ставка', 0, true, 'official_salary', NOW(3), NOW(3)),
('hourly', 'Погодинні', 1, true, 'hourly', NOW(3), NOW(3)),
('unofficial_cash', 'Неофіційна ставка', 2, true, 'unofficial_cash', NOW(3), NOW(3));

-- HrPerson
CREATE TABLE `hr_persons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dilovodPersonId` VARCHAR(32) NULL,
    `dilovodCode` VARCHAR(32) NULL,
    `displayName` VARCHAR(255) NOT NULL,
    `taxCode` VARCHAR(32) NULL,
    `phone` VARCHAR(20) NULL,
    `email` VARCHAR(255) NULL,
    `address` TEXT NULL,
    `dilovodParentId` VARCHAR(32) NULL,
    `dilovodPersonTypeId` VARCHAR(32) NULL,
    `dilovodStateId` VARCHAR(32) NULL,
    `isDeletedInDilovod` BOOLEAN NOT NULL DEFAULT false,
    `localStatus` VARCHAR(32) NOT NULL DEFAULT 'active',
    `canonicalPersonId` INTEGER NULL,
    `duplicateOfId` INTEGER NULL,
    `notes` TEXT NULL,
    `dilovodVersion` VARCHAR(32) NULL,
    `lastSyncedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `hr_persons_dilovodPersonId_key`(`dilovodPersonId`),
    INDEX `hr_persons_dilovodParentId_idx`(`dilovodParentId`),
    INDEX `hr_persons_localStatus_idx`(`localStatus`),
    INDEX `hr_persons_phone_idx`(`phone`),
    INDEX `hr_persons_taxCode_idx`(`taxCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- HrLegalEntity: dilovodFirmId
ALTER TABLE `hr_legal_entities` ADD COLUMN `dilovodFirmId` VARCHAR(32) NULL;
CREATE UNIQUE INDEX `hr_legal_entities_dilovodFirmId_key` ON `hr_legal_entities`(`dilovodFirmId`);

-- HrEmployee: personId
ALTER TABLE `hr_employees` ADD COLUMN `personId` INTEGER NULL;
CREATE INDEX `hr_employees_personId_idx` ON `hr_employees`(`personId`);
ALTER TABLE `hr_employees` ADD CONSTRAINT `hr_employees_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `hr_persons`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- HrEmployment: new fields + payGroupId migration
ALTER TABLE `hr_employments` ADD COLUMN `payGroupId` INTEGER NULL;
ALTER TABLE `hr_employments` ADD COLUMN `personnelNumber` VARCHAR(16) NULL;
ALTER TABLE `hr_employments` ADD COLUMN `dilovodEmployeeId` VARCHAR(32) NULL;
ALTER TABLE `hr_employments` ADD COLUMN `officialPosition` VARCHAR(255) NULL;
ALTER TABLE `hr_employments` ADD COLUMN `unofficialPosition` VARCHAR(255) NULL;
ALTER TABLE `hr_employments` ADD COLUMN `employeeCategory` VARCHAR(64) NULL;
ALTER TABLE `hr_employments` ADD COLUMN `benefitCode` VARCHAR(32) NULL;

UPDATE `hr_employments` e
JOIN `hr_pay_groups` pg ON pg.slug = e.payGroup
SET e.payGroupId = pg.id;

ALTER TABLE `hr_employments` MODIFY `payGroupId` INTEGER NOT NULL;
CREATE INDEX `hr_employments_payGroupId_idx` ON `hr_employments`(`payGroupId`);
CREATE UNIQUE INDEX `hr_employments_dilovodEmployeeId_key` ON `hr_employments`(`dilovodEmployeeId`);
ALTER TABLE `hr_employments` ADD CONSTRAINT `hr_employments_payGroupId_fkey` FOREIGN KEY (`payGroupId`) REFERENCES `hr_pay_groups`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `hr_employments` DROP COLUMN `payGroup`;

-- HrStaffOrder
CREATE TABLE `hr_staff_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employmentId` INTEGER NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `position` VARCHAR(255) NULL,
    `orderDate` DATE NOT NULL,
    `orderNumber` VARCHAR(64) NULL,
    `hireDate` DATE NULL,
    `dismissDate` DATE NULL,
    `dilovodDocId` VARCHAR(32) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `hr_staff_orders_dilovodDocId_key`(`dilovodDocId`),
    INDEX `hr_staff_orders_employmentId_idx`(`employmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `hr_staff_orders` ADD CONSTRAINT `hr_staff_orders_employmentId_fkey` FOREIGN KEY (`employmentId`) REFERENCES `hr_employments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- HrPayrollLine: payGroupId + ESV hooks
ALTER TABLE `hr_payroll_lines` ADD COLUMN `payGroupId` INTEGER NULL;
ALTER TABLE `hr_payroll_lines` ADD COLUMN `esvAmount` DECIMAL(12, 2) NULL;
ALTER TABLE `hr_payroll_lines` ADD COLUMN `taxAmount` DECIMAL(12, 2) NULL;

UPDATE `hr_payroll_lines` pl
JOIN `hr_pay_groups` pg ON pg.slug = pl.payGroup
SET pl.payGroupId = pg.id;

ALTER TABLE `hr_payroll_lines` MODIFY `payGroupId` INTEGER NOT NULL;
CREATE INDEX `hr_payroll_lines_payGroupId_idx` ON `hr_payroll_lines`(`payGroupId`);
ALTER TABLE `hr_payroll_lines` ADD CONSTRAINT `hr_payroll_lines_payGroupId_fkey` FOREIGN KEY (`payGroupId`) REFERENCES `hr_pay_groups`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `hr_payroll_lines` DROP COLUMN `payGroup`;
