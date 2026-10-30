-- CreateTable
CREATE TABLE `chatwoot_bot_knowledge_entries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NOT NULL,
    `questions` JSON NOT NULL,
    `answer` TEXT NOT NULL,
    `tags` JSON NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `hits` INTEGER NOT NULL DEFAULT 0,
    `createdBy` INTEGER NULL,
    `updatedBy` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `chatwoot_bot_knowledge_entries_enabled_idx`(`enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
