/*
  Warnings:

  - A unique constraint covering the columns `[dilovodDocId]` on the table `warehouse_movement` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `warehouse_movement_dilovodDocId_key` ON `warehouse_movement`(`dilovodDocId`);
