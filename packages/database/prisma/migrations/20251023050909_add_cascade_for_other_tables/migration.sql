-- DropForeignKey
ALTER TABLE "BillingHistory" DROP CONSTRAINT "BillingHistory_subscriptionId_fkey";

-- DropForeignKey
ALTER TABLE "PersonalAccessToken" DROP CONSTRAINT "PersonalAccessToken_userId_fkey";

-- DropForeignKey
ALTER TABLE "RecallLog" DROP CONSTRAINT "RecallLog_conversationId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_invitationCodeId_fkey";

-- DropForeignKey
ALTER TABLE "WebhookDeliveryLog" DROP CONSTRAINT "WebhookDeliveryLog_activityId_fkey";

-- DropForeignKey
ALTER TABLE "WebhookDeliveryLog" DROP CONSTRAINT "WebhookDeliveryLog_webhookConfigurationId_fkey";

-- AddForeignKey
ALTER TABLE "PersonalAccessToken" ADD CONSTRAINT "PersonalAccessToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecallLog" ADD CONSTRAINT "RecallLog_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_invitationCodeId_fkey" FOREIGN KEY ("invitationCodeId") REFERENCES "InvitationCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDeliveryLog" ADD CONSTRAINT "WebhookDeliveryLog_webhookConfigurationId_fkey" FOREIGN KEY ("webhookConfigurationId") REFERENCES "WebhookConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDeliveryLog" ADD CONSTRAINT "WebhookDeliveryLog_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingHistory" ADD CONSTRAINT "BillingHistory_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
