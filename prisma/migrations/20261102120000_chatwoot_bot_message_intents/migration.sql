-- CreateTable
CREATE TABLE `chatwoot_bot_message_intents` (
    `questionHash` CHAR(64) NOT NULL,
    `contentNorm` VARCHAR(512) NOT NULL,
    `parts` JSON NOT NULL,
    `model` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`questionHash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
