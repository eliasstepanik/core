import { z } from "zod";
import { createActionApiRoute } from "~/services/routeBuilders/apiBuilder.server";
import { SearchService } from "~/services/search.server";
import { makeModelCall } from "~/lib/model.server";
import { json } from "@remix-run/node";

export const QABodyRequest = z.object({
  question: z.string(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  spaceId: z.string().optional(),
  limit: z.number().optional(),
  maxBfsDepth: z.number().optional(),
  includeInvalidated: z.boolean().optional(),
  entityTypes: z.array(z.string()).optional(),
  scoreThreshold: z.number().optional(),
  minResults: z.number().optional(),
});

const searchService = new SearchService();
const { action, loader } = createActionApiRoute(
  {
    body: QABodyRequest,
    allowJWT: true,
    authorization: {
      action: "search",
    },
    corsStrategy: "all",
  },
  async ({ body, authentication }) => {
    // First, search for relevant information
    const searchResults = await searchService.search(
      body.question,
      authentication.userId,
      {
        startTime: body.startTime ? new Date(body.startTime) : undefined,
        endTime: body.endTime ? new Date(body.endTime) : undefined,
        limit: body.limit || 20, // Get more results for better context
        maxBfsDepth: body.maxBfsDepth,
        includeInvalidated: body.includeInvalidated,
        entityTypes: body.entityTypes,
        scoreThreshold: body.scoreThreshold,
        minResults: body.minResults,
      },
    );

    // Combine episodes and facts into context
    const context = [...searchResults.episodes, ...searchResults.facts].join("\n\n");

    console.log("Context:", context);

    if (!context.trim()) {
      return json({
        question: body.question,
        generated_answer: "I couldn't find any relevant information to answer this question.",
      });
    }

    // Generate answer using LLM
    const prompt = `Based on the following context information, please answer the question. Be specific and concise, using only information from the provided context. If the context doesn't contain enough information to answer the question, say so.

Context:
${context}

Question: ${body.question}

Answer:`;

    let generatedAnswer = "";
    try {
      generatedAnswer = await makeModelCall(
        false, // Don't stream
        [{ role: "user", content: prompt }],
        (_text: string, _model: string) => {
          // onFinish callback - we can log model usage here if needed
        }
      ) as string;
    } catch (error) {
      console.error("Error generating answer:", error);
      generatedAnswer = "I encountered an error while generating an answer to this question.";
    }

    return json({
      question: body.question,
      generated_answer: generatedAnswer.trim(),
    });
  },
);

export { action, loader };