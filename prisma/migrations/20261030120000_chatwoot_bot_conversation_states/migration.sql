-- CreateTable
CREATE TABLE `chatwoot_bot_conversation_states` (
    `conversationId` INTEGER NOT NULL,
    `verifiedOrderIds` JSON NULL,
    `verifiedPhoneHash` VARCHAR(64) NULL,
    `verifyExpiresAt` DATETIME(3) NULL,
    `pendingPhoneEnc` VARCHAR(255) NULL,
    `pendingPhoneExpiresAt` DATETIME(3) NULL,
    `rateWindowStart` DATETIME(3) NULL,
    `rateCount` INTEGER NOT NULL DEFAULT 0,
    `failedAttempts` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `chatwoot_bot_conversation_states_updatedAt_idx`(`updatedAt`),
    PRIMARY KEY (`conversationId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
