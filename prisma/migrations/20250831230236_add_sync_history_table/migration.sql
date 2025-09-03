-- CreateTable
CREATE TABLE `sync_history` (
    `id` VARCHAR(191) NOT NULL,
    `syncType` VARCHAR(191) NOT NULL,
    `startDate` VARCHAR(191) NULL,
    `endDate` VARCHAR(191) NULL,
    `totalOrders` INTEGER NOT NULL,
    `newOrders` INTEGER NOT NULL,
    `updatedOrders` INTEGER NOT NULL,
    `skippedOrders` INTEGER NOT NULL,
    `errors` INTEGER NOT NULL,
    `duration` DOUBLE NOT NULL,
    `details` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `errorMessage` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
