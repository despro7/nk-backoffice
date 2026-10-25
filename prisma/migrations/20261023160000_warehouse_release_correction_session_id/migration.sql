-- AlterTable
ALTER TABLE `warehouse_release_set` ADD COLUMN `correctionSessionId` VARCHAR(36) NULL;

-- Backfill from items JSON (перший елемент масиву)
UPDATE `warehouse_release_set`
SET `correctionSessionId` = NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(`items`, '$[0].correction_session_id'))), '')
WHERE `correctionSessionId` IS NULL
  AND JSON_EXTRACT(`items`, '$[0].correction_session_id') IS NOT NULL;

-- CreateIndex
CREATE INDEX `warehouse_release_set_correctionSessionId_idx` ON `warehouse_release_set`(`correctionSessionId`);
