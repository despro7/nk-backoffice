-- CreateTable
CREATE TABLE `settings_base` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(255) NOT NULL,
    `value` TEXT NOT NULL,
    `description` TEXT,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,

    PRIMARY KEY (`id`)
);

-- CreateIndex
CREATE UNIQUE INDEX `settings_base_key_key` ON `settings_base`(`key`);

-- Insert default weight tolerance settings
INSERT INTO `settings_base` (`key`, `value`, `description`) VALUES
('weight_tolerance_percentage', '5', 'Допустимая погрешность веса в процентах'),
('weight_tolerance_absolute', '0.02', 'Допустимая погрешность веса в кг');
