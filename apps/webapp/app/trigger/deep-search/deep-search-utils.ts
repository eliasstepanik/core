import { type CoreMessage } from "ai";
import { logger } from "@trigger.dev/sdk/v3";
import { generate } from "./stream-utils";
import { processTag } from "../chat/stream-utils";
import { type AgentMessage, AgentMessageType, Message } from "../chat/types";
import { type TotalCost } from "../utils/types";

/**
 * Run the deep search ReAct loop
 * Async generator that yields AgentMessage objects for streaming
 * Follows the exact same pattern as chat-utils.ts
 */
export async function* run(
  initialMessages: CoreMessage[],
  searchTool: any,
): AsyncGenerator<AgentMessage, any, any> {
  let messages = [...initialMessages];
  let completed = false;
  let guardLoop = 0;
  let searchCount = 0;
  let totalEpisodesFound = 0;
  const seenEpisodeIds = new Set<string>(); // Track unique episodes
  const totalCost: TotalCost = {
    inputTokens: 0,
    outputTokens: 0,
    cost: 0,
  };

  const tools = {
    searchMemory: searchTool,
  };

  logger.info("Starting deep search ReAct loop");

  try {
    while (!completed && guardLoop < 50) {
      logger.info(
        `ReAct loop iteration ${guardLoop}, searches: ${searchCount}`,
      );

      // Call LLM with current message history
      const response = generate(
        messages,
        (event) => {
          const usage = event.usage;
          totalCost.inputTokens += usage.promptTokens;
          totalCost.outputTokens += usage.completionTokens;
        },
        tools,
      );

      let totalMessage = "";
      const toolCalls: any[] = [];

      // States for streaming final_response tags
      const messageState = {
        inTag: false,
        message: "",
        messageEnded: false,
        lastSent: "",
      };

      // Process streaming response
      for await (const chunk of response) {
        if (typeof chunk === "object" && chunk.type === "tool-call") {
          // Agent made a tool call
          toolCalls.push(chunk);
          logger.info(`Tool call: ${chunk.toolName}`);
        } else if (typeof chunk === "string") {
          totalMessage += chunk;

          // Stream final_response tags using processTag
          if (!messageState.messageEnded) {
            yield* processTag(
              messageState,
              totalMessage,
              chunk,
              "<final_response>",
              "</final_response>",
              {
                start: AgentMessageType.MESSAGE_START,
                chunk: AgentMessageType.MESSAGE_CHUNK,
                end: AgentMessageType.MESSAGE_END,
              },
            );
          }
        }
      }

      // Check for final response
      if (totalMessage.includes("<final_response>")) {
        const match = totalMessage.match(
          /<final_response>(.*?)<\/final_response>/s,
        );

        if (match) {
          // Accept synthesis - completed
          completed = true;
          logger.info(
            `Final synthesis accepted after ${searchCount} searches, ${totalEpisodesFound} unique episodes found`,
          );
          break;
        }
      }

      // Execute tool calls in parallel for better performance
      if (toolCalls.length > 0) {
        // Notify about all searches starting
        for (const toolCall of toolCalls) {
          logger.info(`Executing search: ${JSON.stringify(toolCall.args)}`);
          yield Message("", AgentMessageType.SKILL_START);
          yield Message(
            `\nSearching memory: "${toolCall.args.query}"...\n`,
            AgentMessageType.SKILL_CHUNK,
          );
          yield Message("", AgentMessageType.SKILL_END);
        }

        // Execute all searches in parallel
        const searchPromises = toolCalls.map((toolCall) =>
          searchTool.execute(toolCall.args).then((result: any) => ({
            toolCall,
            result,
          })),
        );

        const searchResults = await Promise.all(searchPromises);

        // Process results and add to message history
        for (const { toolCall, result } of searchResults) {
          searchCount++;

          // Deduplicate episodes - track unique IDs
          let uniqueNewEpisodes = 0;
          if (result.episodes && Array.isArray(result.episodes)) {
            for (const episode of result.episodes) {
              const episodeId =
                episode.id || episode._id || JSON.stringify(episode);
              if (!seenEpisodeIds.has(episodeId)) {
                seenEpisodeIds.add(episodeId);
                uniqueNewEpisodes++;
              }
            }
          }

          const episodesInThisSearch = result.episodes?.length || 0;
          totalEpisodesFound = seenEpisodeIds.size; // Use unique count

          messages.push({
            role: "assistant",
            content: [
              {
                type: "tool-call",
                toolCallId: toolCall.toolCallId,
                toolName: toolCall.toolName,
                args: toolCall.args,
              },
            ],
          });

          // Add tool result to message history
          messages.push({
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolName: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                result: result,
              },
            ],
          });

          logger.info(
            `Search ${searchCount} completed: ${episodesInThisSearch} episodes (${uniqueNewEpisodes} new, ${totalEpisodesFound} unique total)`,
          );
        }

        // If found no episodes and haven't exhausted search attempts, require more searches
        if (totalEpisodesFound === 0 && searchCount < 7) {
          logger.info(
            `Agent attempted synthesis with 0 unique episodes after ${searchCount} searches - requiring more attempts`,
          );

          yield Message("", AgentMessageType.SKILL_START);
          yield Message(
            `No relevant context found yet - trying different search angles...`,
            AgentMessageType.SKILL_CHUNK,
          );
          yield Message("", AgentMessageType.SKILL_END);

          messages.push({
            role: "system",
            content: `You have performed ${searchCount} searches but found 0 unique relevant episodes. Your queries may be too abstract or not matching the user's actual conversation topics.

Review your DECOMPOSITION:
- Are you using specific terms from the content?
- Try searching broader related topics the user might have discussed
- Try different terminology or related concepts
- Search for user's projects, work areas, or interests

Continue with different search strategies (you can search up to 7-10 times total).`,
          });

          guardLoop++;
          continue;
        }

        // Soft nudging after all searches executed (awareness, not commands)
        if (totalEpisodesFound >= 30 && searchCount >= 3) {
          logger.info(
            `Nudging: ${totalEpisodesFound} unique episodes found - suggesting synthesis consideration`,
          );

          messages.push({
            role: "system",
            content: `Context awareness: You have found ${totalEpisodesFound} unique episodes across ${searchCount} searches. This represents substantial context. Consider whether you have sufficient information for quality synthesis, or if additional search angles would meaningfully improve understanding.`,
          });
        } else if (totalEpisodesFound >= 15 && searchCount >= 5) {
          logger.info(
            `Nudging: ${totalEpisodesFound} unique episodes after ${searchCount} searches - suggesting evaluation`,
          );

          messages.push({
            role: "system",
            content: `Progress update: You have ${totalEpisodesFound} unique episodes from ${searchCount} searches. Evaluate whether you have covered the main angles from your decomposition, or if important aspects remain unexplored.`,
          });
        } else if (searchCount >= 7) {
          logger.info(
            `Nudging: ${searchCount} searches completed with ${totalEpisodesFound} unique episodes`,
          );

          messages.push({
            role: "system",
            content: `Search depth: You have performed ${searchCount} searches and found ${totalEpisodesFound} unique episodes. Consider whether additional searches would yield meaningfully different context, or if it's time to synthesize what you've discovered.`,
          });
        }
        if (searchCount >= 10) {
          logger.info(
            `Reached maximum search limit (10), forcing synthesis with ${totalEpisodesFound} unique episodes`,
          );

          yield Message("", AgentMessageType.SKILL_START);
          yield Message(
            `Maximum searches reached - synthesizing results...`,
            AgentMessageType.SKILL_CHUNK,
          );
          yield Message("", AgentMessageType.SKILL_END);

          messages.push({
            role: "system",
            content: `You have performed 10 searches and found ${totalEpisodesFound} unique episodes. This is the maximum allowed. You MUST now provide your final synthesis wrapped in <final_response> tags based on what you've found.`,
          });
        }
      }

      // Safety check - if no tool calls and no final response, something went wrong
      if (
        toolCalls.length === 0 &&
        !totalMessage.includes("<final_response>")
      ) {
        logger.warn("Agent produced neither tool calls nor final response");

        messages.push({
          role: "system",
          content:
            "You must either use the searchMemory tool to search for more context, or provide your final synthesis wrapped in <final_response> tags.",
        });
      }

      guardLoop++;
    }

    if (!completed) {
      logger.warn(
        `Loop ended without completion after ${guardLoop} iterations`,
      );
      yield Message("", AgentMessageType.MESSAGE_START);
      yield Message(
        "Deep search did not complete - maximum iterations reached.",
        AgentMessageType.MESSAGE_CHUNK,
      );
      yield Message("", AgentMessageType.MESSAGE_END);
    }

    yield Message("Stream ended", AgentMessageType.STREAM_END);
  } catch (error) {
    logger.error(`Deep search error: ${error}`);
    yield Message((error as Error).message, AgentMessageType.ERROR);
    yield Message("Stream ended", AgentMessageType.STREAM_END);
  }
}
