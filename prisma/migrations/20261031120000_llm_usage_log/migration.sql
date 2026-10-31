-- CreateTable
CREATE TABLE `llm_usage_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `provider` VARCHAR(16) NOT NULL,
    `model` VARCHAR(191) NOT NULL,
    `feature` VARCHAR(48) NOT NULL,
    `inputTokens` INTEGER NOT NULL DEFAULT 0,
    `outputTokens` INTEGER NOT NULL DEFAULT 0,
    `apiCalls` INTEGER NOT NULL DEFAULT 1,
    `costUsd` DECIMAL(12, 6) NULL,
    `ok` BOOLEAN NOT NULL DEFAULT true,
    `error` VARCHAR(255) NULL,

    INDEX `llm_usage_log_createdAt_idx`(`createdAt`),
    INDEX `llm_usage_log_provider_createdAt_idx`(`provider`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
