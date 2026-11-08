-- Notification Centre: Telegram links per user and the delivery outbox.

-- CreateTable
CREATE TABLE `notification_telegram_links` (
    `userId` INTEGER NOT NULL,
    `chatId` VARCHAR(32) NULL,
    `username` VARCHAR(64) NULL,
    `firstName` VARCHAR(128) NULL,
    `linkCode` VARCHAR(32) NULL,
    `linkCodeExpires` DATETIME(3) NULL,
    `linkedAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `notification_telegram_links_linkCode_key`(`linkCode`),
    INDEX `notification_telegram_links_chatId_idx`(`chatId`),
    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_outbox` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `metaLogId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `channel` VARCHAR(16) NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `fingerprint` VARCHAR(64) NOT NULL,
    `payload` JSON NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `lastError` VARCHAR(500) NULL,
    `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `notification_outbox_metaLogId_userId_channel_key`(`metaLogId`, `userId`, `channel`),
    INDEX `notification_outbox_status_nextAttemptAt_idx`(`status`, `nextAttemptAt`),
    INDEX `notification_outbox_userId_fingerprint_createdAt_idx`(`userId`, `fingerprint`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
