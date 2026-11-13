-- Адресні задачі тепер закриваються, коли хтось на них відреагував (resolveDirectNotifications).
-- Разово закриваємо ті, що вже застаріли: позначка «Вирішено» для всіх (hiddenBy._all).

-- Специфікація: чернетки на затвердженні вже немає.
UPDATE `meta_logs` m
SET m.`hiddenBy` = JSON_SET(COALESCE(m.`hiddenBy`, JSON_OBJECT()), '$._all', DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.000Z'))
WHERE m.`category` = 'catalog_spec'
  AND (
    JSON_UNQUOTE(JSON_EXTRACT(m.`data`, '$.event')) = 'specReview'
    OR (JSON_EXTRACT(m.`data`, '$.event') IS NULL AND m.`title` IN ('Специфікація чекає на затвердження', 'Оновлено чернетку специфікації'))
  )
  AND (m.`hiddenBy` IS NULL OR JSON_EXTRACT(m.`hiddenBy`, '$._all') IS NULL)
  AND NOT EXISTS (
    SELECT 1 FROM `catalog_spec_drafts` d
    WHERE d.`goodId` = JSON_UNQUOTE(JSON_EXTRACT(m.`data`, '$.goodId')) AND d.`status` = 'pending'
  );

-- Специфікація: з кількох сповіщень про одну чернетку лишаємо найновіше.
UPDATE `meta_logs` m
JOIN (
  SELECT JSON_UNQUOTE(JSON_EXTRACT(`data`, '$.goodId')) AS goodId, MAX(`id`) AS lastId
  FROM `meta_logs`
  WHERE `category` = 'catalog_spec'
    AND (
      JSON_UNQUOTE(JSON_EXTRACT(`data`, '$.event')) = 'specReview'
      OR (JSON_EXTRACT(`data`, '$.event') IS NULL AND `title` IN ('Специфікація чекає на затвердження', 'Оновлено чернетку специфікації'))
    )
  GROUP BY JSON_UNQUOTE(JSON_EXTRACT(`data`, '$.goodId'))
) last ON last.goodId = JSON_UNQUOTE(JSON_EXTRACT(m.`data`, '$.goodId'))
SET m.`hiddenBy` = JSON_SET(COALESCE(m.`hiddenBy`, JSON_OBJECT()), '$._all', DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.000Z'))
WHERE m.`category` = 'catalog_spec'
  AND m.`id` < last.lastId
  AND (
    JSON_UNQUOTE(JSON_EXTRACT(m.`data`, '$.event')) = 'specReview'
    OR (JSON_EXTRACT(m.`data`, '$.event') IS NULL AND m.`title` IN ('Специфікація чекає на затвердження', 'Оновлено чернетку специфікації'))
  )
  AND (m.`hiddenBy` IS NULL OR JSON_EXTRACT(m.`hiddenBy`, '$._all') IS NULL);

-- Техкарта: чернетки на затвердженні вже немає.
UPDATE `meta_logs` m
SET m.`hiddenBy` = JSON_SET(COALESCE(m.`hiddenBy`, JSON_OBJECT()), '$._all', DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.000Z'))
WHERE m.`category` = 'production_techcard'
  AND JSON_UNQUOTE(JSON_EXTRACT(m.`data`, '$.event')) = 'techCardReview'
  AND (m.`hiddenBy` IS NULL OR JSON_EXTRACT(m.`hiddenBy`, '$._all') IS NULL)
  AND NOT EXISTS (
    SELECT 1 FROM `tech_card_drafts` d
    WHERE d.`goodId` = JSON_UNQUOTE(JSON_EXTRACT(m.`data`, '$.goodId')) AND d.`status` = 'pending'
  );

-- Варки: крок уже виконано або варку скасовано.
UPDATE `meta_logs` m
JOIN `production_batches` b ON b.`id` = CAST(JSON_UNQUOTE(JSON_EXTRACT(m.`data`, '$.batchId')) AS UNSIGNED)
SET m.`hiddenBy` = JSON_SET(COALESCE(m.`hiddenBy`, JSON_OBJECT()), '$._all', DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.000Z'))
WHERE m.`category` = 'production_batch'
  AND (m.`hiddenBy` IS NULL OR JSON_EXTRACT(m.`hiddenBy`, '$._all') IS NULL)
  AND (
    (JSON_UNQUOTE(JSON_EXTRACT(m.`data`, '$.event')) = 'batchIssue' AND b.`status` <> 'draft')
    OR (JSON_UNQUOTE(JSON_EXTRACT(m.`data`, '$.event')) = 'batchAcceptProduction' AND b.`status` <> 'issued')
    OR (JSON_UNQUOTE(JSON_EXTRACT(m.`data`, '$.event')) = 'batchAcceptFinished' AND b.`status` <> 'output')
  );
