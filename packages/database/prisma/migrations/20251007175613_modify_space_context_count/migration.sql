/*
  Warnings:

  - You are about to drop the column `statementCount` on the `Space` table. All the data in the column will be lost.
  - You are about to drop the column `statementCountAtLastTrigger` on the `Space` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Space" DROP COLUMN "statementCount",
DROP COLUMN "statementCountAtLastTrigger",
ADD COLUMN     "contextCount" INTEGER,
ADD COLUMN     "contextCountAtLastTrigger" INTEGER;
