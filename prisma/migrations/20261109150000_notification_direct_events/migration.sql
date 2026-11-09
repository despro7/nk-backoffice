-- Адресні сповіщення стали налаштовуватися в ролі (action.notify.direct.<event>.<channel>).
-- Вмикаємо обидва канали всім ролям, щоб поведінка не змінилась: раніше адресні приходили завжди.
INSERT INTO `role_permissions` (`roleId`, `permissionKey`)
SELECT r.`id`, k.`permissionKey`
FROM `roles` r
CROSS JOIN (
  SELECT 'action.notify.direct.specReview.app' AS `permissionKey`
  UNION ALL SELECT 'action.notify.direct.specReview.tg'
  UNION ALL SELECT 'action.notify.direct.specResult.app'
  UNION ALL SELECT 'action.notify.direct.specResult.tg'
) k
WHERE r.`slug` <> 'admin'
  AND NOT EXISTS (
    SELECT 1
    FROM `role_permissions` rp
    WHERE rp.`roleId` = r.`id`
      AND rp.`permissionKey` = k.`permissionKey`
  );
