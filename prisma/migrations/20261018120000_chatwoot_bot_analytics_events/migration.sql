-- CreateTable
CREATE TABLE `chatwoot_bot_analytics_events` (
    `id` VARCHAR(36) NOT NULL,
    `kind` VARCHAR(32) NOT NULL,
    `conversationId` INTEGER NULL,
    `messageId` INTEGER NULL,
    `inboxId` INTEGER NULL,
    `agentId` INTEGER NULL,
    `contentPreview` VARCHAR(512) NULL,
    `contentNorm` VARCHAR(512) NULL,
    `inHours` BOOLEAN NULL,
    `meta` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `chatwoot_bot_analytics_events_createdAt_idx`(`createdAt`),
    INDEX `chatwoot_bot_analytics_events_kind_createdAt_idx`(`kind`, `createdAt`),
    INDEX `chatwoot_bot_analytics_events_contentNorm_idx`(`contentNorm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
