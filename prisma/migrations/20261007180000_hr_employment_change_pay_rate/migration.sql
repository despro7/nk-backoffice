-- New HR permission: change employment pay rate (ADMIN + BOSS)
INSERT INTO `role_permissions` (`roleId`, `permissionKey`)
SELECT r.`id`, 'action.hr.employment.change-pay-rate'
FROM `roles` r
WHERE r.`slug` IN ('admin', 'boss')
  AND NOT EXISTS (
    SELECT 1 FROM `role_permissions` rp
    WHERE rp.`roleId` = r.`id` AND rp.`permissionKey` = 'action.hr.employment.change-pay-rate'
  );
