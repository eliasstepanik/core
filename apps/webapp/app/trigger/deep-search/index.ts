import { metadata, task } from "@trigger.dev/sdk";
import { type CoreMessage } from "ai";
import { logger } from "@trigger.dev/sdk/v3";
import { nanoid } from "nanoid";
import {
  deletePersonalAccessToken,
  getOrCreatePersonalAccessToken,
} from "../utils/utils";
import { getReActPrompt } from "./prompt";
import { type DeepSearchPayload, type DeepSearchResponse } from "./types";
import { createSearchMemoryTool } from "./utils";
import { run } from "./deep-search-utils";
import { AgentMessageType } from "../chat/types";

export const deepSearch = task({
  id: "deep-search",
  maxDuration: 3000,
  run: async (payload: DeepSearchPayload): Promise<DeepSearchResponse> => {
    const {
      content,
      userId,
      stream,
      metadata: meta,
      intentOverride,
    } = payload;

    const randomKeyName = `deepSearch_${nanoid(10)}`;

    // Get or create token for search API calls
    const pat = await getOrCreatePersonalAccessToken({
      name: randomKeyName,
      userId: userId as string,
    });

    if (!pat?.token) {
      throw new Error("Failed to create personal access token");
    }

    try {
      // Create search tool that agent will use
      const searchTool = createSearchMemoryTool(pat.token);

      // Build initial messages with ReAct prompt
      const initialMessages: CoreMessage[] = [
        {
          role: "system",
          content: getReActPrompt(meta, intentOverride),
        },
        {
          role: "user",
          content: `CONTENT TO ANALYZE:\n${content}\n\nPlease search my memory for relevant context and synthesize what you find.`,
        },
      ];

      // Run the ReAct loop generator
      const llmResponse = run(initialMessages, searchTool);

      if (stream) {
        // Streaming mode: stream via metadata.stream like chat.ts does
        // This makes all message types available to clients in real-time
        const messageStream = await metadata.stream("messages", llmResponse);

        let synthesis = "";

        for await (const step of messageStream) {
          // MESSAGE_CHUNK: Final synthesis - accumulate and stream
          if (step.type === AgentMessageType.MESSAGE_CHUNK) {
            synthesis += step.message;
          }

          // STREAM_END: Loop completed
          if (step.type === AgentMessageType.STREAM_END) {
            break;
          }
        }

        await deletePersonalAccessToken(pat?.id);

        // Clean up any remaining tags
        synthesis = synthesis
          .replace(/<final_response>/gi, "")
          .replace(/<\/final_response>/gi, "")
          .trim();

        return { synthesis };
      } else {
        // Non-streaming mode: consume generator without streaming
        let synthesis = "";

        for await (const step of llmResponse) {
          if (step.type === AgentMessageType.MESSAGE_CHUNK) {
            synthesis += step.message;
          }
          // Could also collect episodes from tool results if needed
        }

        await deletePersonalAccessToken(pat?.id);

        // Clean up any remaining tags
        synthesis = synthesis
          .replace(/<final_response>/gi, "")
          .replace(/<\/final_response>/gi, "")
          .trim();

        // For non-streaming, we need to get episodes from search results
        // Since we don't have direct access to search results in this flow,
        // we'll return synthesis without episodes for now
        // (episodes can be extracted from tool results if needed)
        return { synthesis };
      }
    } catch (error) {
      await deletePersonalAccessToken(pat?.id);
      logger.error(`Deep search error: ${error}`);
      throw error;
    }
  },
});
