import { queue, task } from "@trigger.dev/sdk";
import { type z } from "zod";
import crypto from "crypto";

import { IngestionStatus } from "@core/database";
import { EpisodeTypeEnum, type DocumentNode } from "@core/types";
import { logger } from "~/services/logger.service";
import { DocumentChunker } from "~/services/documentChunker.server";
import { saveDocument } from "~/services/graphModels/document";
import { type IngestBodyRequest } from "~/lib/ingest.server";
import { prisma } from "../utils/prisma";
import { ingestTask } from "./ingest";

const documentIngestionQueue = queue({
  name: "document-ingestion-queue",
  concurrencyLimit: 5,
});

// Register the Document Ingestion Trigger.dev task
export const ingestDocumentTask = task({
  id: "ingest-document",
  queue: documentIngestionQueue,
  machine: "medium-2x",
  run: async (payload: {
    body: z.infer<typeof IngestBodyRequest>;
    userId: string;
    workspaceId: string;
    queueId: string;
  }) => {
    const startTime = Date.now();

    try {
      logger.log(`Processing document for user ${payload.userId}`, {
        documentTitle: payload.body.documentTitle,
        contentLength: payload.body.episodeBody.length,
      });

      await prisma.ingestionQueue.update({
        where: { id: payload.queueId },
        data: {
          status: IngestionStatus.PROCESSING,
        },
      });

      const documentBody = payload.body as any;

      // Step 1: Create document node
      const document: DocumentNode = {
        uuid: crypto.randomUUID(),
        title: documentBody.documentTitle || "Untitled Document",
        originalContent: documentBody.episodeBody,
        metadata: documentBody.metadata || {},
        source: documentBody.source,
        userId: payload.userId,
        createdAt: new Date(),
        validAt: new Date(documentBody.referenceTime),
        totalChunks: 0,
        documentId: documentBody.documentId,
        sessionId: documentBody.sessionId,
      };

      await saveDocument(document);

      // Step 2: Chunk the document
      const documentChunker = new DocumentChunker();
      const chunkedDocument = await documentChunker.chunkDocument(
        documentBody.episodeBody,
        documentBody.documentTitle,
      );

      logger.log(
        `Document chunked into ${chunkedDocument.chunks.length} chunks`,
      );

      // Step 3: Queue each chunk as a separate episode
      for (const chunk of chunkedDocument.chunks) {
        const chunkEpisodeData = {
          episodeBody: chunk.content,
          referenceTime: documentBody.referenceTime,
          metadata: documentBody.metadata,
          source: documentBody.source,
          spaceId: documentBody.spaceId,
          sessionId: documentBody.sessionId,
          type: EpisodeTypeEnum.DOCUMENT,
          documentTitle: documentBody.documentTitle,
          documentId: documentBody.documentId,
          chunkIndex: chunk.chunkIndex,
        };

        const episodeHandler = await ingestTask.trigger(
          {
            body: chunkEpisodeData,
            userId: payload.userId,
            workspaceId: payload.workspaceId,
            queueId: payload.queueId,
          },
          {
            queue: "ingestion-queue",
            concurrencyKey: payload.userId,
            tags: [payload.userId, payload.queueId],
          },
        );

        if (episodeHandler.id) {
          logger.log(
            `Queued chunk ${chunk.chunkIndex + 1}/${chunkedDocument.chunks.length} for processing`,
            {
              handlerId: episodeHandler.id,
              chunkSize: chunk.content.length,
            },
          );
        }
      }

      await prisma.ingestionQueue.update({
        where: { id: payload.queueId },
        data: {
          output: {
            documentUuid: document.uuid,
            totalChunks: chunkedDocument.chunks.length,
            episodes: [],
          },
          status: IngestionStatus.PROCESSING,
        },
      });

      const processingTimeMs = Date.now() - startTime;

      logger.log(
        `Document chunking processing completed in ${processingTimeMs}ms`,
        {
          documentUuid: document.uuid,
          totalChunks: chunkedDocument.chunks.length,
        },
      );

      return { success: true };
    } catch (err: any) {
      await prisma.ingestionQueue.update({
        where: { id: payload.queueId },
        data: {
          error: err.message,
          status: IngestionStatus.FAILED,
        },
      });

      logger.error(
        `Error processing document for user ${payload.userId}:`,
        err,
      );
      return { success: false, error: err.message };
    }
  },
});
