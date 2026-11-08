-- Techcards phase 1: loss split per spec row (local only, not synced to Dilovod).
-- cookingLossPercent stays as the total (sum of the split) for existing readers.
ALTER TABLE `catalog_good_components` ADD COLUMN `lossesJson` JSON NULL AFTER `cookingLossPercent`;

-- Grant page.settings.production (loss types, loss formula) to Director; admin has it implicitly.
INSERT INTO `role_permissions` (`roleId`, `permissionKey`)
SELECT r.`id`, 'page.settings.production'
FROM `roles` r
WHERE r.`slug` IN ('boss')
  AND NOT EXISTS (
    SELECT 1
    FROM `role_permissions` rp
    WHERE rp.`roleId` = r.`id`
      AND rp.`permissionKey` = 'page.settings.production'
  );
