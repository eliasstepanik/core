import { z } from "zod";
import { logger } from "~/services/logger.service";
import { SpaceService } from "~/services/space.server";
import { makeModelCall } from "~/lib/model.server";
import { createBatch, getBatch } from "~/lib/batch.server";
import { runQuery } from "~/lib/neo4j.server";
import {
  assignEpisodesToSpace,
  getSpaceEpisodeCount,
} from "~/services/graphModels/space";
import {
  updateMultipleSpaceStatuses,
  SPACE_STATUS,
} from "~/trigger/utils/space-status";
import type { CoreMessage } from "ai";
import type { Space } from "@prisma/client";

export interface SpaceAssignmentPayload {
  userId: string;
  workspaceId: string;
  mode: "new_space" | "episode";
  newSpaceId?: string; // For new_space mode
  episodeIds?: string[]; // For episode mode
  batchSize?: number; // Processing batch size
}

interface EpisodeData {
  uuid: string;
  content: string;
  originalContent: string;
  source: string;
  createdAt: Date;
  metadata: any;
}

interface SpaceData {
  uuid: string;
  name: string;
  description?: string;
  episodeCount: number;
}

interface AssignmentResult {
  episodeId: string;
  spaceIds: string[];
  confidence: number;
  reasoning?: string;
}

const CONFIG = {
  newSpaceMode: {
    batchSize: 20,
    confidenceThreshold: 0.75,
    useBatchAPI: true,
    minEpisodesForBatch: 5,
  },
  episodeMode: {
    batchSize: 20,
    confidenceThreshold: 0.75,
    useBatchAPI: true,
    minEpisodesForBatch: 5,
  },
};

// Zod schema for LLM response validation
const AssignmentResultSchema = z.array(
  z.object({
    episodeId: z.string(),
    addSpaceId: z.array(z.string()),
    confidence: z.number(),
    reasoning: z.string(),
  }),
);

/**
 * Core business logic for space assignment
 * This is shared between Trigger.dev and BullMQ implementations
 */
export async function processSpaceAssignment(
  payload: SpaceAssignmentPayload,
  // Callback functions for enqueueing follow-up jobs
  enqueueSpaceSummary?: (params: {
    userId: string;
    workspaceId: string;
    spaceId: string;
    triggerSource: string;
  }) => Promise<any>,
  enqueueSpacePattern?: (params: {
    userId: string;
    workspaceId: string;
    spaceId: string;
  }) => Promise<any>,
): Promise<{
  success: boolean;
  mode: string;
  processed: number;
  assignments: number;
  batches?: number;
  spacesAvailable: number;
  affectedSpaces: number;
}> {
  const {
    userId,
    workspaceId,
    mode,
    newSpaceId,
    episodeIds,
    batchSize = mode === "new_space"
      ? CONFIG.newSpaceMode.batchSize
      : CONFIG.episodeMode.batchSize,
  } = payload;

  logger.info(`Starting space assignment`, {
    userId,
    mode,
    newSpaceId,
    episodeIds,
    batchSize,
  });

  const spaceService = new SpaceService();

  try {
    // 1. Get user's spaces
    const spaces = await spaceService.getUserSpaces(userId);

    if (spaces.length === 0) {
      logger.info(`No spaces found for user ${userId}, skipping assignment`);
      return {
        success: true,
        mode,
        processed: 0,
        assignments: 0,
        spacesAvailable: 0,
        affectedSpaces: 0,
      };
    }

    // 2. Get episodes to analyze based on mode
    const episodes = await getEpisodesToAnalyze(userId, mode, {
      newSpaceId,
      episodeIds,
    });

    if (episodes.length === 0) {
      logger.info(
        `No episodes to analyze for user ${userId} in ${mode} mode`,
      );
      return {
        success: true,
        mode,
        processed: 0,
        assignments: 0,
        spacesAvailable: spaces.length,
        affectedSpaces: 0,
      };
    }

    // 3. Process episodes using batch AI or fallback to sequential
    const config =
      mode === "new_space" ? CONFIG.newSpaceMode : CONFIG.episodeMode;
    const shouldUseBatchAPI = true;

    let totalProcessed = 0;
    let totalAssignments = 0;
    let totalBatches = 0;
    const affectedSpaces = new Set<string>();

    if (shouldUseBatchAPI) {
      logger.info(
        `Using Batch AI processing for ${episodes.length} episodes`,
        {
          mode,
          userId,
          batchSize,
        },
      );

      const batchResult = await processBatchAI(
        episodes,
        spaces,
        userId,
        mode,
        newSpaceId,
        batchSize,
      );
      totalProcessed = batchResult.processed;
      totalAssignments = batchResult.assignments;
      batchResult.affectedSpaces?.forEach((spaceId) =>
        affectedSpaces.add(spaceId),
      );
    } else {
      logger.info(
        `Using sequential processing for ${episodes.length} episodes (below batch threshold)`,
        {
          mode,
          userId,
          minRequired: config.minEpisodesForBatch,
        },
      );

      totalBatches = Math.ceil(episodes.length / batchSize);

      for (let i = 0; i < totalBatches; i++) {
        const batch = episodes.slice(i * batchSize, (i + 1) * batchSize);

        logger.info(
          `Processing batch ${i + 1}/${totalBatches} with ${batch.length} episodes`,
          {
            mode,
            userId,
          },
        );

        const batchResult = await processBatch(
          batch,
          spaces,
          userId,
          mode,
          newSpaceId,
        );
        totalProcessed += batchResult.processed;
        totalAssignments += batchResult.assignments;
        batchResult.affectedSpaces?.forEach((spaceId) =>
          affectedSpaces.add(spaceId),
        );

        // Add delay between batches to avoid rate limiting
        if (i < totalBatches - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    logger.info(`Completed LLM space assignment`, {
      userId,
      mode,
      totalProcessed,
      totalAssignments,
      spacesAvailable: spaces.length,
      affectedSpaces: affectedSpaces.size,
    });

    // 4. Update space status to "processing" for affected spaces
    if (affectedSpaces.size > 0) {
      try {
        await updateMultipleSpaceStatuses(
          Array.from(affectedSpaces),
          SPACE_STATUS.PROCESSING,
          {
            userId,
            operation: "space-assignment",
            metadata: { mode, phase: "start_processing" },
          },
        );
      } catch (statusError) {
        logger.warn(`Failed to update space statuses to processing:`, {
          error: statusError,
          userId,
          mode,
        });
      }
    }

    // 5. Trigger space summaries for affected spaces (if callback provided)
    if (affectedSpaces.size > 0 && enqueueSpaceSummary) {
      try {
        logger.info(
          `Triggering space summaries for ${affectedSpaces.size} affected spaces in parallel`,
        );

        const summaryPromises = Array.from(affectedSpaces).map((spaceId) =>
          enqueueSpaceSummary({
            userId,
            workspaceId,
            spaceId,
            triggerSource: "assignment",
          }).catch((error) => {
            logger.warn(`Failed to trigger summary for space ${spaceId}:`, {
              error,
            });
            return { success: false, spaceId, error: error.message };
          }),
        );

        const summaryResults = await Promise.allSettled(summaryPromises);
        const successful = summaryResults.filter(
          (r) => r.status === "fulfilled",
        ).length;
        const failed = summaryResults.filter(
          (r) => r.status === "rejected",
        ).length;

        logger.info(`Space summary triggers completed`, {
          userId,
          mode,
          totalSpaces: affectedSpaces.size,
          successful,
          failed,
        });
      } catch (summaryError) {
        logger.warn(`Failed to trigger space summaries after assignment:`, {
          error: summaryError,
          userId,
          mode,
          affectedSpaces: Array.from(affectedSpaces),
        });
      }
    }

    // 6. Update space status to "ready" after all processing is complete
    if (affectedSpaces.size > 0) {
      try {
        await updateMultipleSpaceStatuses(
          Array.from(affectedSpaces),
          SPACE_STATUS.READY,
          {
            userId,
            operation: "space-assignment",
            metadata: { mode, phase: "completed_processing" },
          },
        );
      } catch (finalStatusError) {
        logger.warn(`Failed to update space statuses to ready:`, {
          error: finalStatusError,
          userId,
          mode,
        });
      }
    }

    return {
      success: true,
      mode,
      processed: totalProcessed,
      assignments: totalAssignments,
      batches: totalBatches,
      spacesAvailable: spaces.length,
      affectedSpaces: affectedSpaces.size,
    };
  } catch (error) {
    logger.error(
      `Error in LLM space assignment for user ${userId}:`,
      error as Record<string, unknown>,
    );
    throw error;
  }
}

async function getEpisodesToAnalyze(
  userId: string,
  mode: "new_space" | "episode",
  options: { newSpaceId?: string; episodeIds?: string[] },
): Promise<EpisodeData[]> {
  let query: string;
  let params: any = { userId };

  if (mode === "new_space") {
    query = `
      MATCH (e:Episode {userId: $userId})
      WHERE e.validAt IS NOT NULL
      RETURN e.uuid as uuid, e.content as content, e.originalContent as originalContent,
             e.source as source, e.createdAt as createdAt, e.metadata as metadata
      ORDER BY e.validAt DESC
      LIMIT 100
    `;
  } else {
    // episode mode: analyze specific episodes
    if (!options.episodeIds || options.episodeIds.length === 0) {
      return [];
    }
    query = `
      MATCH (e:Episode {userId: $userId})
      WHERE e.uuid IN $episodeIds AND e.validAt IS NOT NULL
      RETURN e.uuid as uuid, e.content as content, e.originalContent as originalContent,
             e.source as source, e.createdAt as createdAt, e.metadata as metadata
    `;
    params.episodeIds = options.episodeIds;
  }

  const result = await runQuery(query, params);
  return result.records.map((record) => ({
    uuid: record.get("uuid"),
    content: record.get("content"),
    originalContent: record.get("originalContent"),
    source: record.get("source"),
    createdAt: record.get("createdAt"),
    metadata: record.get("metadata"),
  }));
}

async function processBatchAI(
  episodes: EpisodeData[],
  spaces: Space[],
  userId: string,
  mode: string,
  newSpaceId?: string,
  batchSize = 20,
): Promise<{
  processed: number;
  assignments: number;
  affectedSpaces?: string[];
}> {
  const spaceData = await Promise.all(
    spaces.map(async (space) => ({
      uuid: space.uuid,
      name: space.name,
      description: space.description || "",
      episodeCount: await getSpaceEpisodeCount(space.uuid),
    })),
  );

  // Create batch request
  const customId = `batch-${userId}-${Date.now()}`;
  const request = {
    custom_id: customId,
    method: "POST",
    url: "/v1/chat/completions",
    body: {
      model: "gpt-4o-mini-2024-07-18",
      messages: generateAssignmentPrompt(episodes, spaceData, mode, newSpaceId),
      response_format: { type: "json_object" },
    },
  };

  // Submit batch
  const batch = await createBatch([request]);
  logger.info(`Batch created: ${batch.id}`);

  // Poll for completion
  let batchResult = await getBatch(batch.id);
  while (batchResult.status === "in_progress" || batchResult.status === "validating") {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    batchResult = await getBatch(batch.id);
  }

  if (batchResult.status !== "completed") {
    throw new Error(`Batch processing failed: ${batchResult.status}`);
  }

  // Parse results
  const results = batchResult.output || [];
  let totalAssignments = 0;
  const affectedSpaces = new Set<string>();

  for (const result of results) {
    const response = result.response?.body?.choices?.[0]?.message?.content;
    if (!response) continue;

    try {
      const parsed = JSON.parse(response);
      const assignments = AssignmentResultSchema.parse(parsed.assignments);

      for (const assignment of assignments) {
        if (assignment.addSpaceId && assignment.addSpaceId.length > 0) {
          await assignEpisodesToSpace(
            userId,
            assignment.episodeId,
            assignment.addSpaceId,
          );
          totalAssignments++;
          assignment.addSpaceId.forEach((spaceId) => affectedSpaces.add(spaceId));
        }
      }
    } catch (parseError) {
      logger.warn("Failed to parse batch result:", parseError);
    }
  }

  return {
    processed: episodes.length,
    assignments: totalAssignments,
    affectedSpaces: Array.from(affectedSpaces),
  };
}

async function processBatch(
  episodes: EpisodeData[],
  spaces: Space[],
  userId: string,
  mode: string,
  newSpaceId?: string,
): Promise<{
  processed: number;
  assignments: number;
  affectedSpaces?: string[];
}> {
  const spaceData = await Promise.all(
    spaces.map(async (space) => ({
      uuid: space.uuid,
      name: space.name,
      description: space.description || "",
      episodeCount: await getSpaceEpisodeCount(space.uuid),
    })),
  );

  const messages = generateAssignmentPrompt(episodes, spaceData, mode, newSpaceId);
  const response = await makeModelCall({
    messages,
    mode: "json",
    complexity: "high",
  });

  let assignments: AssignmentResult[] = [];
  try {
    const parsed = JSON.parse(response.text);
    const validated = AssignmentResultSchema.parse(parsed.assignments);
    assignments = validated.map((a) => ({
      episodeId: a.episodeId,
      spaceIds: a.addSpaceId,
      confidence: a.confidence,
      reasoning: a.reasoning,
    }));
  } catch (parseError) {
    logger.warn("Failed to parse LLM response:", parseError);
    return { processed: 0, assignments: 0 };
  }

  const affectedSpaces = new Set<string>();
  let totalAssignments = 0;

  for (const assignment of assignments) {
    if (assignment.spaceIds && assignment.spaceIds.length > 0) {
      await assignEpisodesToSpace(
        userId,
        assignment.episodeId,
        assignment.spaceIds,
      );
      totalAssignments++;
      assignment.spaceIds.forEach((spaceId) => affectedSpaces.add(spaceId));
    }
  }

  return {
    processed: episodes.length,
    assignments: totalAssignments,
    affectedSpaces: Array.from(affectedSpaces),
  };
}

function generateAssignmentPrompt(
  episodes: EpisodeData[],
  spaces: SpaceData[],
  mode: string,
  newSpaceId?: string,
): CoreMessage[] {
  const systemPrompt = `You are a knowledge organization assistant that assigns episodes (memories/experiences) to relevant topical spaces.

Your task is to analyze each episode and determine which existing spaces it belongs to based on:
1. Topic relevance - Does the episode discuss topics related to the space?
2. Context alignment - Does it fit the overall theme and context of the space?
3. Information value - Does it add meaningful information to the space?

Guidelines:
- An episode can belong to multiple spaces if it's relevant to multiple topics
- Only assign to spaces where the episode provides meaningful context
- Be selective - not every episode needs to be assigned to every space
- Consider the space's existing content (episodeCount) when making decisions

Return your assignments as a JSON object with this structure:
{
  "assignments": [
    {
      "episodeId": "episode-uuid",
      "addSpaceId": ["space-uuid-1", "space-uuid-2"],
      "confidence": 0.85,
      "reasoning": "Brief explanation of why this assignment makes sense"
    }
  ]
}`;

  const episodesText = episodes
    .map(
      (ep, i) =>
        `Episode ${i + 1} (ID: ${ep.uuid}):
Source: ${ep.source}
Content: ${ep.content.slice(0, 500)}${ep.content.length > 500 ? "..." : ""}
`,
    )
    .join("\n\n");

  const spacesText = spaces
    .map(
      (s) =>
        `Space: ${s.name} (ID: ${s.uuid})
Description: ${s.description || "No description"}
Current episodes: ${s.episodeCount}`,
    )
    .join("\n\n");

  const userPrompt = `Available Spaces:
${spacesText}

Episodes to Assign:
${episodesText}

Analyze each episode and return your assignment decisions.`;

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];
}
