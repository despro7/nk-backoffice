-- Initialize reporting_day_start_hour setting if not exists
INSERT INTO settings_base (key, value, description, category, isActive, createdAt, updatedAt)
SELECT 
  'reporting_day_start_hour',
  '0',
  'Start hour for reporting day (0-23, 0 = midnight)',
  'reporting',
  1,
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM settings_base WHERE key = 'reporting_day_start_hour'
);
