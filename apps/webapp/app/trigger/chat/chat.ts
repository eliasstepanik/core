import { PrismaClient } from "@prisma/client";
import { ActionStatusEnum } from "@core/types";
import { logger, metadata, task } from "@trigger.dev/sdk/v3";
import { format } from "date-fns";

import { run } from "./chat-utils";
import { MCP } from "../utils/mcp";
import { type HistoryStep } from "../utils/types";
import {
  createConversationHistoryForAgent,
  getPreviousExecutionHistory,
  init,
  type RunChatPayload,
  updateConversationHistoryMessage,
  updateConversationStatus,
  updateExecutionStep,
} from "../utils/utils";

const prisma = new PrismaClient();

/**
 * Main chat task that orchestrates the agent workflow
 * Handles conversation context, agent selection, and LLM interactions
 */
export const chat = task({
  id: "chat",
  maxDuration: 3000,
  queue: {
    name: "chat",
    concurrencyLimit: 30,
  },
  init,
  run: async (payload: RunChatPayload, { init }) => {
    await updateConversationStatus("running", payload.conversationId);

    try {
      let creditForChat = 0;

      const { previousHistory, ...otherData } = payload.context;

      const isContinuation = payload.isContinuation || false;

      // Initialise mcp
      const mcp = new MCP();
      await mcp.init();

      // Prepare context with additional metadata
      const context = {
        // Currently this is assuming we only have one page in context
        context: {
          ...(otherData.page && otherData.page.length > 0
            ? { page: otherData.page[0] }
            : {}),
        },
        workpsaceId: init?.conversation.workspaceId,
        resources: otherData.resources,
      };

      // Extract user's goal from conversation history
      const message = init?.conversationHistory?.message;
      // Retrieve execution history from previous interactions
      const previousExecutionHistory = getPreviousExecutionHistory(
        previousHistory ?? [],
      );

      let agentUserMessage = "";
      let agentConversationHistory;
      let stepHistory: HistoryStep[] = [];
      // Prepare conversation history in agent-compatible format
      agentConversationHistory = await createConversationHistoryForAgent(
        payload.conversationId,
      );

      const llmResponse = run(
        message as string,
        context,
        previousExecutionHistory,
        mcp,
        stepHistory,
      );

      const stream = await metadata.stream("messages", llmResponse);

      let conversationStatus = "success";
      for await (const step of stream) {
        if (step.type === "STEP") {
          creditForChat += 1;
          const stepDetails = JSON.parse(step.message as string);

          if (stepDetails.skillStatus === ActionStatusEnum.TOOL_REQUEST) {
            conversationStatus = "need_approval";
          }

          if (stepDetails.skillStatus === ActionStatusEnum.QUESTION) {
            conversationStatus = "need_attention";
          }

          await updateExecutionStep(
            { ...stepDetails },
            agentConversationHistory.id,
          );

          agentUserMessage += stepDetails.userMessage;

          await updateConversationHistoryMessage(
            agentUserMessage,
            agentConversationHistory.id,
          );
        } else if (step.type === "STREAM_END") {
          break;
        }
      }

      await updateConversationStatus(
        conversationStatus,
        payload.conversationId,
      );

      // await addToMemory(
      //   init.conversation.id,
      //   message,
      //   agentUserMessage,
      //   init.preferences,
      //   init.userName,
      // );
    } catch (e) {
      await updateConversationStatus("failed", payload.conversationId);
      throw new Error(e as string);
    }
  },
});
