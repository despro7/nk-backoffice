-- Notification Centre: personal preferences (muted groups, Telegram opt-outs, sound).

-- CreateTable
CREATE TABLE `notification_user_prefs` (
    `userId` INTEGER NOT NULL,
    `prefs` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
