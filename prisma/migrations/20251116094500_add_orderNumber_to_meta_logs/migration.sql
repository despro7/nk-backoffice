-- Add orderNumber column to meta_logs table for easier lookup and counting
ALTER TABLE `meta_logs`
  ADD COLUMN `orderNumber` VARCHAR(128) NULL AFTER `data`;

CREATE INDEX `meta_logs_orderNumber_idx` ON `meta_logs`(`orderNumber`);

-- Backfill `orderNumber` from JSON `data` where possible
UPDATE `meta_logs`
SET `orderNumber` = JSON_UNQUOTE(JSON_EXTRACT(data, '$.orderNumber'))
WHERE JSON_EXTRACT(data, '$.orderNumber') IS NOT NULL;
