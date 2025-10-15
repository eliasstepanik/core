import { tool } from "ai";
import { z } from "zod";
import axios from "axios";
import { logger } from "@trigger.dev/sdk/v3";

export function createSearchMemoryTool(token: string) {
  return tool({
    description:
      "Search the user's memory for relevant facts and episodes. Use this tool multiple times with different queries to gather comprehensive context.",
    parameters: z.object({
      query: z
        .string()
        .describe(
          "Search query to find relevant information. Be specific: entity names, topics, concepts."
        ),
    }),
    execute: async ({ query }) => {
      try {
        const response = await axios.post(
          `${process.env.API_BASE_URL || "https://core.heysol.ai"}/api/v1/search`,
          { query },
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const searchResult = response.data;

        return {
          facts: searchResult.facts || [],
          episodes: searchResult.episodes || [],
          summary: `Found ${searchResult.episodes?.length || 0} relevant memories`,
        };
      } catch (error) {
        logger.error(`SearchMemory tool error: ${error}`);
        return {
          facts: [],
          episodes: [],
          summary: "No results found",
        };
      }
    },
  });
}

// Helper to extract unique episodes from tool calls
export function extractEpisodesFromToolCalls(toolCalls: any[]): any[] {
  const episodes: any[] = [];

  for (const call of toolCalls || []) {
    if (call.toolName === "searchMemory" && call.result?.episodes) {
      episodes.push(...call.result.episodes);
    }
  }

  // Deduplicate by content + createdAt
  const uniqueEpisodes = Array.from(
    new Map(
      episodes.map((e) => [`${e.content}-${e.createdAt}`, e])
    ).values()
  );

  return uniqueEpisodes.slice(0, 10);
}
