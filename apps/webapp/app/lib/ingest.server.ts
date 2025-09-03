// lib/ingest.queue.ts
import { IngestionStatus } from "@core/database";
import { EpisodeType } from "@core/types";
import { type z } from "zod";
import { prisma } from "~/db.server";
import { type IngestBodyRequest, ingestTask } from "~/trigger/ingest/ingest";
import { ingestDocumentTask } from "~/trigger/ingest/ingest-document";

export const addToQueue = async (
  body: z.infer<typeof IngestBodyRequest>,
  userId: string,
  activityId?: string,
) => {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
    },
    include: {
      Workspace: true,
    },
  });

  if (!user?.Workspace?.id) {
    throw new Error(
      "Workspace ID is required to create an ingestion queue entry.",
    );
  }

  const queuePersist = await prisma.ingestionQueue.create({
    data: {
      spaceId: body.spaceId ? body.spaceId : null,
      data: body,
      status: IngestionStatus.PENDING,
      priority: 1,
      workspaceId: user.Workspace.id,
      activityId,
    },
  });

  let ingestionType = EpisodeType.CONVERSATION;
  if (body.documentId) {
    ingestionType = EpisodeType.DOCUMENT;
  }

  let handler;
  if (ingestionType === EpisodeType.DOCUMENT) {
    handler = await ingestDocumentTask.trigger(
      {
        body: { ...body, type: ingestionType },
        userId,
        workspaceId: user.Workspace.id,
        queueId: queuePersist.id,
      },
      {
        queue: "document-ingestion-queue",
        concurrencyKey: userId,
        tags: [user.id, queuePersist.id],
      },
    );
  } else if (ingestionType === EpisodeType.CONVERSATION) {
    handler = await ingestTask.trigger(
      {
        body: { ...body, type: ingestionType },
        userId,
        workspaceId: user.Workspace.id,
        queueId: queuePersist.id,
      },
      {
        queue: "ingestion-queue",
        concurrencyKey: userId,
        tags: [user.id, queuePersist.id],
      },
    );
  }

  return { id: handler?.id, token: handler?.publicAccessToken };
};

export { IngestBodyRequest };
