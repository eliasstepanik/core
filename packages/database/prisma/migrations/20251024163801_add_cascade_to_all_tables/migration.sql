-- DropForeignKey
ALTER TABLE "Activity" DROP CONSTRAINT "Activity_integrationAccountId_fkey";

-- DropForeignKey
ALTER TABLE "ConversationExecutionStep" DROP CONSTRAINT "ConversationExecutionStep_conversationHistoryId_fkey";

-- DropForeignKey
ALTER TABLE "ConversationHistory" DROP CONSTRAINT "ConversationHistory_activityId_fkey";

-- DropForeignKey
ALTER TABLE "ConversationHistory" DROP CONSTRAINT "ConversationHistory_conversationId_fkey";

-- DropForeignKey
ALTER TABLE "IngestionQueue" DROP CONSTRAINT "IngestionQueue_activityId_fkey";

-- DropForeignKey
ALTER TABLE "IntegrationAccount" DROP CONSTRAINT "IntegrationAccount_integrationDefinitionId_fkey";

-- DropForeignKey
ALTER TABLE "OAuthClient" DROP CONSTRAINT "OAuthClient_createdById_fkey";

-- DropForeignKey
ALTER TABLE "WebhookConfiguration" DROP CONSTRAINT "WebhookConfiguration_userId_fkey";

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_integrationAccountId_fkey" FOREIGN KEY ("integrationAccountId") REFERENCES "IntegrationAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationExecutionStep" ADD CONSTRAINT "ConversationExecutionStep_conversationHistoryId_fkey" FOREIGN KEY ("conversationHistoryId") REFERENCES "ConversationHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationHistory" ADD CONSTRAINT "ConversationHistory_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationHistory" ADD CONSTRAINT "ConversationHistory_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionQueue" ADD CONSTRAINT "IngestionQueue_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationAccount" ADD CONSTRAINT "IntegrationAccount_integrationDefinitionId_fkey" FOREIGN KEY ("integrationDefinitionId") REFERENCES "IntegrationDefinitionV2"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthClient" ADD CONSTRAINT "OAuthClient_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookConfiguration" ADD CONSTRAINT "WebhookConfiguration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
