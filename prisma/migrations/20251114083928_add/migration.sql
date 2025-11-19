-- CreateTable
CREATE TABLE `meta_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `datetime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `category` VARCHAR(32) NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `message` VARCHAR(191) NULL,
    `data` JSON NULL,
    `metadata` JSON NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
