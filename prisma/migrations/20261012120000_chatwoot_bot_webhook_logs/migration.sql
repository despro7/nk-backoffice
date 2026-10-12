-- Chatwoot Agent Bot: журнал webhook / обробки (TTL + max N у коді)

CREATE TABLE `chatwoot_bot_webhook_logs` (
    `id` VARCHAR(36) NOT NULL,
    `source` VARCHAR(16) NOT NULL,
    `action` VARCHAR(16) NOT NULL,
    `reason` VARCHAR(128) NOT NULL,
    `conversationId` INTEGER NULL,
    `messageId` INTEGER NULL,
    `contentPreview` VARCHAR(512) NULL,
    `replyMode` VARCHAR(16) NOT NULL,
    `dryRun` BOOLEAN NOT NULL DEFAULT false,
    `details` TEXT NULL,
    `webhookEvent` VARCHAR(64) NULL,
    `headersMeta` JSON NULL,
    `payloadJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`),
    INDEX `chatwoot_bot_webhook_logs_createdAt_idx`(`createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
