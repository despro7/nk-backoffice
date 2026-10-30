-- CreateTable
CREATE TABLE `chatwoot_bot_question_topics` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `origin` VARCHAR(16) NOT NULL DEFAULT 'auto',
    `createdBy` INTEGER NULL,
    `updatedBy` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chatwoot_bot_question_assignments` (
    `questionHash` CHAR(64) NOT NULL,
    `contentNorm` VARCHAR(512) NOT NULL,
    `preview` VARCHAR(512) NOT NULL,
    `topicId` INTEGER NULL,
    `source` VARCHAR(16) NOT NULL DEFAULT 'auto',
    `ignored` BOOLEAN NOT NULL DEFAULT false,
    `confidence` DOUBLE NULL,
    `method` VARCHAR(16) NOT NULL DEFAULT 'local',
    `updatedBy` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `chatwoot_bot_question_assignments_topicId_idx`(`topicId`),
    PRIMARY KEY (`questionHash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `chatwoot_bot_question_assignments` ADD CONSTRAINT `chatwoot_bot_question_assignments_topicId_fkey` FOREIGN KEY (`topicId`) REFERENCES `chatwoot_bot_question_topics`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
