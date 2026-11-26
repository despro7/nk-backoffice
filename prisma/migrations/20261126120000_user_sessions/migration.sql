-- Per-device auth sessions and login attempts. Additive only: users.refreshToken columns stay for the old code.
-- CreateTable
CREATE TABLE `user_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `userId` INTEGER NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `prevTokenHash` VARCHAR(191) NULL,
    `rotatedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastUsedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `userAgent` VARCHAR(255) NULL,
    `ip` VARCHAR(191) NULL,
    `lastIp` VARCHAR(191) NULL,
    `city` VARCHAR(96) NULL,
    `region` VARCHAR(96) NULL,
    `country` VARCHAR(8) NULL,
    `deviceType` VARCHAR(16) NULL,
    `browser` VARCHAR(64) NULL,
    `os` VARCHAR(64) NULL,
    `revokedAt` DATETIME(3) NULL,
    `revokedReason` VARCHAR(32) NULL,
    `revokedByUserId` INTEGER NULL,

    UNIQUE INDEX `user_sessions_tokenHash_key`(`tokenHash`),
    INDEX `user_sessions_userId_revokedAt_idx`(`userId`, `revokedAt`),
    INDEX `user_sessions_prevTokenHash_idx`(`prevTokenHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_login_attempts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `userId` INTEGER NULL,
    `ip` VARCHAR(191) NULL,
    `userAgent` VARCHAR(255) NULL,
    `success` BOOLEAN NOT NULL,
    `reason` VARCHAR(32) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `auth_login_attempts_email_idx`(`email`),
    INDEX `auth_login_attempts_userId_idx`(`userId`),
    INDEX `auth_login_attempts_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_sessions` ADD CONSTRAINT `user_sessions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

