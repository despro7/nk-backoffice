-- Spec (BOM) moderation: one pending draft per good + approved version history.

CREATE TABLE `catalog_spec_drafts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `goodId` VARCHAR(32) NOT NULL,
    `baseVersion` INTEGER NOT NULL,
    `specQty` DOUBLE NULL,
    `componentsJson` JSON NOT NULL,
    `comment` TEXT NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `restoredFromVersion` INTEGER NULL,
    `authorId` INTEGER NULL,
    `lastEditedById` INTEGER NULL,
    `reviewedById` INTEGER NULL,
    `reviewedAt` DATETIME(3) NULL,
    `rejectReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `catalog_spec_drafts_goodId_key`(`goodId`),
    INDEX `catalog_spec_drafts_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `catalog_spec_versions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `goodId` VARCHAR(32) NOT NULL,
    `version` INTEGER NOT NULL,
    `specQty` DOUBLE NULL,
    `componentsJson` JSON NOT NULL,
    `source` VARCHAR(16) NOT NULL,
    `comment` TEXT NULL,
    `authorId` INTEGER NULL,
    `approvedById` INTEGER NULL,
    `approvedAt` DATETIME(3) NULL,
    `contentReviewPending` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `catalog_spec_versions_goodId_version_key`(`goodId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `catalog_spec_drafts` ADD CONSTRAINT `catalog_spec_drafts_goodId_fkey` FOREIGN KEY (`goodId`) REFERENCES `catalog_goods`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `catalog_spec_versions` ADD CONSTRAINT `catalog_spec_versions_goodId_fkey` FOREIGN KEY (`goodId`) REFERENCES `catalog_goods`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Grant spec approval to boss (admin has every permission implicitly).
INSERT INTO `role_permissions` (`roleId`, `permissionKey`)
SELECT r.`id`, 'action.products.approveSpec'
FROM `roles` r
WHERE r.`slug` = 'boss'
  AND NOT EXISTS (
    SELECT 1 FROM `role_permissions` rp
    WHERE rp.`roleId` = r.`id` AND rp.`permissionKey` = 'action.products.approveSpec'
  );
