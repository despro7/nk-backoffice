-- HR pay groups: split hourly into official/unofficial
UPDATE `hr_pay_groups` SET `label` = 'Офіційна погодинна', `sortOrder` = 1 WHERE `slug` = 'hourly';
UPDATE `hr_pay_groups` SET `sortOrder` = 3 WHERE `slug` = 'unofficial_cash';

INSERT INTO `hr_pay_groups` (`slug`, `label`, `sortOrder`, `isActive`, `formulaProfile`, `createdAt`, `updatedAt`)
SELECT 'hourly_unofficial', 'Неофіційна погодинна', 2, true, 'hourly_unofficial', NOW(3), NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM `hr_pay_groups` WHERE `slug` = 'hourly_unofficial');

-- Tax rules: short label for column headers
ALTER TABLE `hr_tax_rules` ADD COLUMN `shortLabel` VARCHAR(32) NULL;

-- Bonuses: monthly period (clean start — no data migration)
ALTER TABLE `hr_bonuses` DROP FOREIGN KEY `hr_bonuses_productionWeekId_fkey`;
ALTER TABLE `hr_bonuses` DROP INDEX `hr_bonuses_productionWeekId_idx`;
ALTER TABLE `hr_bonuses` DROP INDEX `hr_bonuses_calendarWeekId_idx`;
ALTER TABLE `hr_bonuses` DROP COLUMN `productionWeekId`;
ALTER TABLE `hr_bonuses` DROP COLUMN `calendarWeekId`;
ALTER TABLE `hr_bonuses` ADD COLUMN `periodYear` INT NOT NULL DEFAULT 2026;
ALTER TABLE `hr_bonuses` ADD COLUMN `periodMonth` INT NOT NULL DEFAULT 1;
ALTER TABLE `hr_bonuses` ALTER COLUMN `periodYear` DROP DEFAULT;
ALTER TABLE `hr_bonuses` ALTER COLUMN `periodMonth` DROP DEFAULT;
CREATE INDEX `hr_bonuses_periodYear_periodMonth_idx` ON `hr_bonuses`(`periodYear`, `periodMonth`);

-- New HR permissions (ADMIN + BOSS)
INSERT INTO `role_permissions` (`roleId`, `permissionKey`)
SELECT r.`id`, p.`key`
FROM `roles` r
CROSS JOIN (
  SELECT 'action.hr.settings.manage' AS `key` UNION ALL
  SELECT 'action.hr.employment.transfer' UNION ALL
  SELECT 'action.hr.employment.change-group' UNION ALL
  SELECT 'action.hr.employment.change-employer'
) p
WHERE r.`slug` IN ('admin', 'boss')
  AND NOT EXISTS (
    SELECT 1 FROM `role_permissions` rp
    WHERE rp.`roleId` = r.`id` AND rp.`permissionKey` = p.`key`
  );
