-- Адресні сповіщення виробництва (техкарта на затвердженні, кроки варки).
-- Вмикаємо обидва канали всім ролям, крім admin, як для специфікацій; роль може вимкнути їх у матриці.
INSERT INTO `role_permissions` (`roleId`, `permissionKey`)
SELECT r.`id`, k.`permissionKey`
FROM `roles` r
CROSS JOIN (
  SELECT 'action.notify.direct.techCardReview.app' AS `permissionKey`
  UNION ALL SELECT 'action.notify.direct.techCardReview.tg'
  UNION ALL SELECT 'action.notify.direct.batchIssue.app'
  UNION ALL SELECT 'action.notify.direct.batchIssue.tg'
  UNION ALL SELECT 'action.notify.direct.batchAcceptProduction.app'
  UNION ALL SELECT 'action.notify.direct.batchAcceptProduction.tg'
  UNION ALL SELECT 'action.notify.direct.batchAcceptFinished.app'
  UNION ALL SELECT 'action.notify.direct.batchAcceptFinished.tg'
  UNION ALL SELECT 'action.notify.direct.batchClose.app'
  UNION ALL SELECT 'action.notify.direct.batchClose.tg'
) k
WHERE r.`slug` <> 'admin'
  AND NOT EXISTS (
    SELECT 1
    FROM `role_permissions` rp
    WHERE rp.`roleId` = r.`id`
      AND rp.`permissionKey` = k.`permissionKey`
  );
