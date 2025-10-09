/*
  Warnings:

  - You are about to drop the column `spaceId` on the `IngestionQueue` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "IngestionQueue" DROP CONSTRAINT "IngestionQueue_spaceId_fkey";

-- AlterTable
ALTER TABLE "IngestionQueue" DROP COLUMN "spaceId";
