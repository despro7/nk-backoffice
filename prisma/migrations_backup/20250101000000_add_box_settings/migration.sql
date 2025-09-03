-- CreateTable
CREATE TABLE `settings_boxes` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `marking` VARCHAR(191) NOT NULL,
  `qntFrom` INTEGER NOT NULL,
  `qntTo` INTEGER NOT NULL,
  `width` INTEGER NOT NULL,
  `height` INTEGER NOT NULL,
  `length` INTEGER NOT NULL,
  `overflow` INTEGER NOT NULL DEFAULT 1,
  `weight` DECIMAL(10,2) NOT NULL,
  `self_weight` DECIMAL(10,2) NOT NULL,
  `description` VARCHAR(191) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `settings_boxes_marking_idx` ON `settings_boxes`(`marking`);
CREATE INDEX `settings_boxes_qntFrom_idx` ON `settings_boxes`(`qntFrom`);
CREATE INDEX `settings_boxes_qntTo_idx` ON `settings_boxes`(`qntTo`);
CREATE INDEX `settings_boxes_isActive_idx` ON `settings_boxes`(`isActive`);

-- Insert default weight tolerance settings
INSERT INTO `settings_boxes` (`id`, `name`, `marking`, `qntFrom`, `qntTo`, `width`, `height`, `length`, `overflow`, `weight`, `self_weight`, `description`, `isActive`, `createdAt`, `updatedAt`) VALUES
(7, 'Коробка XS2', 'XS2', 1, 3, 20, 15, 9, 0, 0.70, 0.15, 'Мала коробка для 1-3 порцій', 1, '2025-08-28 14:13:51.727', '2025-08-28 18:44:43.028'),
(8, 'Коробка S3', 'S3', 4, 5, 24, 17, 9, 0, 1.00, 0.25, 'Середня коробка для 4-5 порцій', 1, '2025-08-28 14:13:51.978', '2025-08-28 14:13:51.978'),
(9, 'Коробка M5', 'M5', 6, 9, 24, 20, 16, 0, 2.00, 0.40, 'Велика коробка для 6-9 порцій', 0, '2025-08-28 14:13:52.145', '2025-08-28 18:45:22.960'),
(10, 'Коробка M2', 'M2', 10, 15, 24, 24, 20, 1, 3.00, 0.60, 'Велика коробка для 10-15 порцій', 1, '2025-08-28 14:13:52.310', '2025-08-28 14:13:52.310'),
(11, 'Коробка NK', 'NK', 16, 24, 40, 24, 20, 2, 5.00, 0.80, 'Велика коробка для 16-24 порцій', 1, '2025-08-28 14:13:52.476', '2025-08-28 14:13:52.476'),
(12, 'Коробка XL1', 'XL1', 25, 36, 40, 35, 20, 2, 10.00, 1.20, 'Дуже велика коробка для 25-36 порцій', 1, '2025-08-28 14:13:52.642', '2025-08-28 14:13:52.642');