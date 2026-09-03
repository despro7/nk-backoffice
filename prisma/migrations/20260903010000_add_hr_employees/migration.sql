-- HR: юрособи, співробітники, зайнятість, ставки (Decimal)
CREATE TABLE `hr_legal_entities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(32) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `kind` VARCHAR(32) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `hr_legal_entities_code_key` ON `hr_legal_entities`(`code`);

CREATE TABLE `hr_employees` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `lastName` VARCHAR(128) NOT NULL,
    `firstName` VARCHAR(128) NOT NULL,
    `middleName` VARCHAR(128) NULL,
    `displayName` VARCHAR(255) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'active',
    `userId` INTEGER NULL,
    `notes` TEXT NULL,
    `cardLast4` VARCHAR(4) NULL,
    `cardNumberEncrypted` VARCHAR(512) NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `hr_employees_userId_key` (`userId`),
    INDEX `hr_employees_status_idx` (`status`),
    INDEX `hr_employees_displayName_idx` (`displayName`),
    INDEX `hr_employees_deletedAt_idx` (`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `hr_employments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employeeId` INTEGER NOT NULL,
    `legalEntityId` INTEGER NOT NULL,
    `payGroup` VARCHAR(32) NOT NULL,
    `validFrom` DATE NOT NULL,
    `validTo` DATE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `hr_employments_employeeId_legalEntityId_validFrom_key` (`employeeId`, `legalEntityId`, `validFrom`),
    INDEX `hr_employments_employeeId_idx` (`employeeId`),
    INDEX `hr_employments_legalEntityId_idx` (`legalEntityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `hr_pay_terms` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employmentId` INTEGER NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(8) NOT NULL DEFAULT 'UAH',
    `effectiveFrom` DATE NOT NULL,
    `effectiveTo` DATE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `hr_pay_terms_employmentId_idx` (`employmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `hr_employees` ADD CONSTRAINT `hr_employees_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `hr_employments` ADD CONSTRAINT `hr_employments_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `hr_employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `hr_employments` ADD CONSTRAINT `hr_employments_legalEntityId_fkey` FOREIGN KEY (`legalEntityId`) REFERENCES `hr_legal_entities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `hr_pay_terms` ADD CONSTRAINT `hr_pay_terms_employmentId_fkey` FOREIGN KEY (`employmentId`) REFERENCES `hr_employments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO `hr_legal_entities` (`code`, `name`, `kind`, `isActive`, `createdAt`, `updatedAt`) VALUES
  ('fop', 'ФОП', 'fop', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('tov', 'ТОВ', 'tov', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('unofficial_cash', 'Нештатні (готівка)', 'unofficial_cash', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
