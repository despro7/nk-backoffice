-- Notification Centre: move small config tables into settings_base (category `notifications`).
-- Each key holds {"nextId": N, "items": [...]}. Kept as tables: notification_config_revisions,
-- notification_outbox.
-- JSON is built as text (CONCAT) because MariaDB stores JSON columns as LONGTEXT;
-- JSON_EXTRACT(x, '$') embeds a JSON column / literal as JSON, not as a quoted string.
-- Rule / glossary nextId also skips ids referenced by revisions, so "revert create" never hits a reused id.

INSERT INTO `settings_base` (`key`, `value`, `description`, `category`, `isActive`, `createdAt`, `updatedAt`)
SELECT 'notification_rules',
  CONCAT('{"nextId":', GREATEST(
      COALESCE((SELECT MAX(`id`) FROM `notification_rules`), 0),
      COALESCE((SELECT MAX(`entityId`) FROM `notification_config_revisions` WHERE `entity` = 'rule'), 0)
    ) + 1,
    ',"items":', COALESCE((
      SELECT JSON_ARRAYAGG(JSON_OBJECT(
        'id', r.`id`,
        'key', r.`key`,
        'name', r.`name`,
        'enabled', JSON_EXTRACT(IF(r.`enabled`, 'true', 'false'), '$'),
        'position', r.`position`,
        'match', JSON_EXTRACT(r.`match`, '$'),
        'output', JSON_EXTRACT(r.`output`, '$'),
        'updatedById', r.`updatedById`,
        'updatedAt', CONCAT(DATE_FORMAT(r.`updatedAt`, '%Y-%m-%dT%H:%i:%s'), '.000Z')
      ))
      FROM `notification_rules` r
    ), '[]'), '}'),
  'Центр сповіщень: правила', 'notifications', 1, NOW(3), NOW(3)
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), `category` = VALUES(`category`);

INSERT INTO `settings_base` (`key`, `value`, `description`, `category`, `isActive`, `createdAt`, `updatedAt`)
SELECT 'notification_glossary',
  CONCAT('{"nextId":', GREATEST(
      COALESCE((SELECT MAX(`id`) FROM `notification_glossary`), 0),
      COALESCE((SELECT MAX(`entityId`) FROM `notification_config_revisions` WHERE `entity` = 'glossary'), 0)
    ) + 1,
    ',"items":', COALESCE((
      SELECT JSON_ARRAYAGG(JSON_OBJECT(
        'id', g.`id`,
        'phrase', g.`phrase`,
        'replacement', g.`replacement`,
        'isRegex', JSON_EXTRACT(IF(g.`isRegex`, 'true', 'false'), '$'),
        'enabled', JSON_EXTRACT(IF(g.`enabled`, 'true', 'false'), '$'),
        'position', g.`position`,
        'updatedById', g.`updatedById`,
        'updatedAt', CONCAT(DATE_FORMAT(g.`updatedAt`, '%Y-%m-%dT%H:%i:%s'), '.000Z')
      ))
      FROM `notification_glossary` g
    ), '[]'), '}'),
  'Центр сповіщень: словник', 'notifications', 1, NOW(3), NOW(3)
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), `category` = VALUES(`category`);

-- id = userId
INSERT INTO `settings_base` (`key`, `value`, `description`, `category`, `isActive`, `createdAt`, `updatedAt`)
SELECT 'notification_user_prefs',
  CONCAT('{"nextId":', COALESCE((SELECT MAX(`userId`) FROM `notification_user_prefs`), 0) + 1,
    ',"items":', COALESCE((
      SELECT JSON_ARRAYAGG(JSON_OBJECT(
        'id', p.`userId`,
        'prefs', JSON_EXTRACT(p.`prefs`, '$'),
        'updatedAt', CONCAT(DATE_FORMAT(p.`updatedAt`, '%Y-%m-%dT%H:%i:%s'), '.000Z')
      ))
      FROM `notification_user_prefs` p
    ), '[]'), '}'),
  'Центр сповіщень: особисті налаштування', 'notifications', 1, NOW(3), NOW(3)
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), `category` = VALUES(`category`);

-- id = userId
INSERT INTO `settings_base` (`key`, `value`, `description`, `category`, `isActive`, `createdAt`, `updatedAt`)
SELECT 'notification_telegram_links',
  CONCAT('{"nextId":', COALESCE((SELECT MAX(`userId`) FROM `notification_telegram_links`), 0) + 1,
    ',"items":', COALESCE((
      SELECT JSON_ARRAYAGG(JSON_OBJECT(
        'id', t.`userId`,
        'chatId', t.`chatId`,
        'username', t.`username`,
        'firstName', t.`firstName`,
        'linkCode', t.`linkCode`,
        'linkCodeExpires', IF(t.`linkCodeExpires` IS NULL, NULL, CONCAT(DATE_FORMAT(t.`linkCodeExpires`, '%Y-%m-%dT%H:%i:%s'), '.000Z')),
        'linkedAt', IF(t.`linkedAt` IS NULL, NULL, CONCAT(DATE_FORMAT(t.`linkedAt`, '%Y-%m-%dT%H:%i:%s'), '.000Z'))
      ))
      FROM `notification_telegram_links` t
    ), '[]'), '}'),
  'Центр сповіщень: підключені Telegram-чати', 'notifications', 1, NOW(3), NOW(3)
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), `category` = VALUES(`category`);

DROP TABLE `notification_rules`;
DROP TABLE `notification_glossary`;
DROP TABLE `notification_user_prefs`;
DROP TABLE `notification_telegram_links`;
