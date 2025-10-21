-- DropForeignKey
ALTER TABLE "IngestionQueue" DROP CONSTRAINT "IngestionQueue_workspaceId_fkey";

-- AddForeignKey
ALTER TABLE "IngestionQueue" ADD CONSTRAINT "IngestionQueue_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
