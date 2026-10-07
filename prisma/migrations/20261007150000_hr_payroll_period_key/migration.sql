-- Окремі знімки розрахунку для кожного режиму періоду (production / month / custom)
ALTER TABLE `hr_payroll_periods`
  ADD COLUMN `periodKey` VARCHAR(80) NOT NULL DEFAULT 'production' AFTER `month`;

ALTER TABLE `hr_payroll_periods`
  DROP INDEX `hr_payroll_periods_year_month_key`;

ALTER TABLE `hr_payroll_periods`
  ADD UNIQUE INDEX `hr_payroll_periods_year_month_periodKey_key` (`year`, `month`, `periodKey`);
