-- CreateTable
CREATE TABLE `auth_settings` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(100) NOT NULL,
    `value` VARCHAR(255) NOT NULL,
    `description` TEXT,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP(3) NOT NULL,

    PRIMARY KEY (`id`)
);

-- CreateIndex
CREATE UNIQUE INDEX `auth_settings_key_key` ON `auth_settings`(`key`);

-- Insert initial values
INSERT INTO `auth_settings` (`key`, `value`, `description`) VALUES
('access_token_expires_in', '1h', 'Время жизни access токена (1h, 2h, 30m, etc.)'),
('refresh_token_expires_in', '30d', 'Время жизни refresh токена (30d, 7d, 1d, etc.)'),
('user_activity_threshold_days', '30', 'Порог неактивности пользователя в днях'),
('middleware_refresh_threshold_seconds', '300', 'Порог обновления токена в middleware в секундах (за 5 минут до истечения)'),
('client_refresh_threshold_minutes', '10', 'Порог обновления токена в клиенте в минутах (за 10 минут до истечения)'),
('token_refresh_enabled', 'true', 'Включить автоматическое обновление токенов'),
('middleware_auto_refresh_enabled', 'true', 'Включить автоматическое обновление в middleware'),
('client_auto_refresh_enabled', 'true', 'Включить автоматическое обновление в клиенте');
