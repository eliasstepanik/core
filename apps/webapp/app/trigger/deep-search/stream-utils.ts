import { openai } from "@ai-sdk/openai";
import { logger } from "@trigger.dev/sdk/v3";
import {
  type CoreMessage,
  type LanguageModelV1,
  streamText,
  type ToolSet,
} from "ai";

/**
 * Generate LLM responses with tool calling support
 * Simplified version for deep-search use case - NO maxSteps for manual ReAct control
 */
export async function* generate(
  messages: CoreMessage[],
  onFinish?: (event: any) => void,
  tools?: ToolSet,
  model?: string,
): AsyncGenerator<
  | string
  | {
      type: string;
      toolName: string;
      args?: any;
      toolCallId?: string;
    }
> {
  const modelToUse = model || process.env.MODEL || "gpt-4.1-2025-04-14";
  const modelInstance = openai(modelToUse) as LanguageModelV1;

  logger.info(`Starting LLM generation with model: ${modelToUse}`);

  try {
    const { textStream, fullStream } = streamText({
      model: modelInstance,
      messages,
      temperature: 1,
      tools,
      // NO maxSteps - we handle tool execution manually in the ReAct loop
      toolCallStreaming: true,
      onFinish,
    });

    // Yield text chunks
    for await (const chunk of textStream) {
      yield chunk;
    }

    // Yield tool calls
    for await (const fullChunk of fullStream) {
      if (fullChunk.type === "tool-call") {
        yield {
          type: "tool-call",
          toolName: fullChunk.toolName,
          toolCallId: fullChunk.toolCallId,
          args: fullChunk.args,
        };
      }

      if (fullChunk.type === "error") {
        logger.error(`LLM error: ${JSON.stringify(fullChunk)}`);
      }
    }
  } catch (error) {
    logger.error(`LLM generation error: ${error}`);
    throw error;
  }
}
