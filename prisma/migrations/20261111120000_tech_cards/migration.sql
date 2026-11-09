-- Techcards phase 2a: versions (approved recipe linked to a spec version) and the pair draft.

CREATE TABLE `tech_card_versions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `goodId` VARCHAR(32) NOT NULL,
    `version` INTEGER NOT NULL,
    `specVersion` INTEGER NULL,
    `payloadJson` JSON NOT NULL,
    `source` VARCHAR(16) NOT NULL DEFAULT 'ui',
    `comment` TEXT NULL,
    `authorId` INTEGER NULL,
    `approvedById` INTEGER NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `tech_card_versions_goodId_version_key`(`goodId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `tech_card_drafts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `goodId` VARCHAR(32) NOT NULL,
    `baseVersion` INTEGER NULL,
    `payloadJson` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'editing',
    `comment` TEXT NULL,
    `authorId` INTEGER NULL,
    `lastEditedById` INTEGER NULL,
    `reviewedById` INTEGER NULL,
    `reviewedAt` DATETIME(3) NULL,
    `rejectReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `tech_card_drafts_goodId_key`(`goodId`),
    INDEX `tech_card_drafts_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `tech_card_versions` ADD CONSTRAINT `tech_card_versions_goodId_fkey` FOREIGN KEY (`goodId`) REFERENCES `catalog_goods`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `tech_card_drafts` ADD CONSTRAINT `tech_card_drafts_goodId_fkey` FOREIGN KEY (`goodId`) REFERENCES `catalog_goods`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Grant page.production.techcards (view techcards) to system roles at storekeeper rank and above; admin has it implicitly.
INSERT INTO `role_permissions` (`roleId`, `permissionKey`)
SELECT r.`id`, 'page.production.techcards'
FROM `roles` r
WHERE r.`slug` IN ('storekeeper', 'warehouse-manager', 'shop-manager', 'boss')
  AND NOT EXISTS (
    SELECT 1
    FROM `role_permissions` rp
    WHERE rp.`roleId` = r.`id`
      AND rp.`permissionKey` = 'page.production.techcards'
  );
