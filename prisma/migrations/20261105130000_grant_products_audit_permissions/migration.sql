-- Grant catalog audit log access (card history + /products/audit page) to boss.
-- admin has every permission implicitly. New keys are added via migration (not runtime sync)
-- so admin edits in UI persist.

INSERT INTO `role_permissions` (`roleId`, `permissionKey`)
SELECT r.`id`, k.`permissionKey`
FROM `roles` r
CROSS JOIN (
  SELECT 'action.products.viewAudit' AS `permissionKey`
  UNION ALL SELECT 'page.main.productsAudit'
) k
WHERE r.`slug` = 'boss'
  AND NOT EXISTS (
    SELECT 1
    FROM `role_permissions` rp
    WHERE rp.`roleId` = r.`id`
      AND rp.`permissionKey` = k.`permissionKey`
  );
