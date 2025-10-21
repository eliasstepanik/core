-- DropForeignKey
ALTER TABLE "ConversationHistory" DROP CONSTRAINT "ConversationHistory_userId_fkey";

-- DropForeignKey
ALTER TABLE "IngestionRule" DROP CONSTRAINT "IngestionRule_userId_fkey";

-- DropForeignKey
ALTER TABLE "RecallLog" DROP CONSTRAINT "RecallLog_userId_fkey";

-- DropForeignKey
ALTER TABLE "UserUsage" DROP CONSTRAINT "UserUsage_userId_fkey";

-- AddForeignKey
ALTER TABLE "ConversationHistory" ADD CONSTRAINT "ConversationHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionRule" ADD CONSTRAINT "IngestionRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecallLog" ADD CONSTRAINT "RecallLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserUsage" ADD CONSTRAINT "UserUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
