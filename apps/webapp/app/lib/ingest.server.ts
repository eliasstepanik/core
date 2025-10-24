// lib/ingest.queue.ts
import { IngestionStatus } from "@core/database";
import { EpisodeType } from "@core/types";
import { type z } from "zod";
import { prisma } from "~/db.server";
import { hasCredits } from "~/services/billing.server";
import { type IngestBodyRequest } from "~/trigger/ingest/ingest";
import {
  enqueueIngestDocument,
  enqueueIngestEpisode,
} from "~/lib/queue-adapter.server";

export const addToQueue = async (
  rawBody: z.infer<typeof IngestBodyRequest>,
  userId: string,
  activityId?: string,
) => {
  const body = { ...rawBody, source: rawBody.source.toLowerCase() };
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

  // Check if workspace has sufficient credits before processing
  const hasSufficientCredits = await hasCredits(
    user.Workspace?.id as string,
    "addEpisode",
  );

  if (!hasSufficientCredits) {
    throw new Error("no credits");
  }

  const queuePersist = await prisma.ingestionQueue.create({
    data: {
      data: body,
      type: body.type,
      status: IngestionStatus.PENDING,
      priority: 1,
      workspaceId: user.Workspace.id,
      activityId,
    },
  });

  let handler;
  if (body.type === EpisodeType.DOCUMENT) {
    handler = await enqueueIngestDocument({
      body,
      userId,
      workspaceId: user.Workspace.id,
      queueId: queuePersist.id,
    });
  } else if (body.type === EpisodeType.CONVERSATION) {
    handler = await enqueueIngestEpisode({
      body,
      userId,
      workspaceId: user.Workspace.id,
      queueId: queuePersist.id,
    });
  }

  return { id: handler?.id, publicAccessToken: handler?.token };
};

export { IngestBodyRequest };
