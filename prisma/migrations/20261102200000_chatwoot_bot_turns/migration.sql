-- CreateTable
CREATE TABLE `chatwoot_bot_turns` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `conversationId` INTEGER NOT NULL,
    `messageId` INTEGER NULL,
    `inboxId` INTEGER NULL,
    `customerText` TEXT NOT NULL,
    `replies` JSON NOT NULL,
    `outcome` VARCHAR(32) NOT NULL,
    `detail` VARCHAR(255) NULL,
    `inHours` BOOLEAN NULL,
    `dryRun` BOOLEAN NOT NULL DEFAULT false,
    `llm` JSON NULL,
    `verify` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `chatwoot_bot_turns_createdAt_idx`(`createdAt`),
    INDEX `chatwoot_bot_turns_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
