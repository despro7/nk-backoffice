-- Grant page.reports.productMovements to system roles at storekeeper rank and above.
-- New permission keys are added via migration (not runtime sync) so admin edits in UI persist.

INSERT INTO `role_permissions` (`roleId`, `permissionKey`)
SELECT r.`id`, 'page.reports.productMovements'
FROM `roles` r
WHERE r.`slug` IN ('storekeeper', 'warehouse-manager', 'shop-manager', 'boss')
  AND NOT EXISTS (
    SELECT 1
    FROM `role_permissions` rp
    WHERE rp.`roleId` = r.`id`
      AND rp.`permissionKey` = 'page.reports.productMovements'
  );
