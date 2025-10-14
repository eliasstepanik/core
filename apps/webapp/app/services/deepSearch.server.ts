import { logger } from "./logger.service";
import { SearchService } from "./search.server";
import { makeModelCall } from "~/lib/model.server";

/**
 * Request interface for deep search
 */
export interface DeepSearchRequest {
  content: string;
  intentOverride?: string;
  metadata?: {
    source?: "chrome" | "obsidian" | "mcp";
    url?: string;
    pageTitle?: string;
  };
}

/**
 * Content analysis result from Phase 1
 */
interface ContentAnalysis {
  intent: string;
  reasoning: string;
  entities: string[];
  temporal: string[];
  actions: string[];
  topics: string[];
  priority: string[];
}

/**
 * Agent decision from Phase 3
 */
interface AgentDecision {
  shouldContinue: boolean;
  confidence: number;
  reasoning: string;
  followUpQueries: string[];
}

/**
 * Response interface for deep search
 */
export interface DeepSearchResponse {
  synthesis: string;
  episodes: Array<{
    content: string;
    createdAt: Date;
    spaceIds: string[];
  }>;
}

/**
 * Deep Search Service
 *
 * Implements a 4-phase intelligent document search pipeline:
 * 1. Content Analysis - Infer intent and decompose content
 * 2. Parallel Broad Search - Fire multiple queries simultaneously
 * 3. Agent Deep Dive - Evaluate and follow up on promising leads
 * 4. Synthesis - Generate intent-aware context summary
 */
export class DeepSearchService {
  constructor(private searchService: SearchService) {}

  /**
   * Main entry point for deep search
   */
  async deepSearch(
    request: DeepSearchRequest,
    userId: string
  ): Promise<DeepSearchResponse> {
    const startTime = Date.now();
    const { content, intentOverride, metadata } = request;

    logger.info("Deep search started", { userId, contentLength: content.length });

    try {
      // Phase 1: Analyze content and infer intent
      const analysis = intentOverride
        ? await this.createAnalysisFromOverride(content, intentOverride)
        : await this.analyzeContent(content, this.getIntentHints(metadata));

      logger.info("Phase 1 complete", { intent: analysis.intent });

      // Extract spaceIds from metadata if available
      const spaceIds: string[] = [];

      // Phase 2: Parallel broad search
      const { episodes: broadEpisodes } = await this.performBroadSearch(
        analysis,
        userId,
        spaceIds
      );

      logger.info("Phase 2 complete", { episodesCount: broadEpisodes.length });

      // Phase 3: Agent-driven deep dive (using episodes for richer context)
      const { episodes: deepDiveEpisodes } = await this.performDeepDive(
        content,
        analysis,
        broadEpisodes,
        userId,
        spaceIds
      );

      logger.info("Phase 3 complete", {
        deepDiveEpisodes: deepDiveEpisodes.length,
      });

      // Combine and deduplicate episodes
      const allEpisodes = [...broadEpisodes, ...deepDiveEpisodes];
      const episodeMap = new Map<string, any>();
      allEpisodes.forEach((ep) => {
        const key = `${ep.content}-${new Date(ep.createdAt).toISOString()}`;
        if (!episodeMap.has(key)) {
          episodeMap.set(key, ep);
        }
      });
      const episodes = Array.from(episodeMap.values());

      // Phase 4: Synthesize results using episodes (richer context than facts)
      const synthesis = await this.synthesizeResults(
        content,
        analysis,
        episodes
      );

      logger.info("Phase 4 complete", {
        duration: Date.now() - startTime,
        totalEpisodes: episodes.length,
      });

      return {
        synthesis,
        episodes,
      };
    } catch (error) {
      logger.error("Deep search error", { error });
      throw error;
    }
  }

  /**
   * Phase 1: Analyze content and infer intent
   */
  private async analyzeContent(
    content: string,
    contextHints: string
  ): Promise<ContentAnalysis> {
    const prompt = `
Analyze this content holistically and determine the user's intent.

CONTENT:
${content}
${contextHints}

YOUR TASK:
1. INFER INTENT: What is the user trying to do with this content?
   Examples: reading email, writing blog post, preparing for meeting,
   researching topic, tracking tasks, reviewing changes, etc.
   Be specific and descriptive.

2. EXTRACT KEY ELEMENTS:
   - Entities: People, places, organizations, objects (e.g., "John Doe", "Project Phoenix")
   - Temporal: Dates, times, recurring events (e.g., "Wednesday standup", "last month")
   - Actions: Verbs, action items, tasks (e.g., "follow up", "review", "fix bug")
   - Topics: Themes, subjects, domains (e.g., "car maintenance", "API design")

3. PRIORITIZE: Which elements are most important to search first?
   Return array like ["entities", "temporal", "topics"] ordered by importance.

RESPONSE FORMAT (JSON):
{
  "intent": "specific intent description",
  "reasoning": "why this intent was inferred",
  "entities": ["entity1", "entity2"],
  "temporal": ["temporal1", "temporal2"],
  "actions": ["action1", "action2"],
  "topics": ["topic1", "topic2"],
  "priority": ["entities", "temporal", "topics"]
}
`;

let responseText = "";
    await makeModelCall(
      false,
      [{ role: "user", content: prompt }],
      (text) => {
        responseText = text;
      },
      {},
      "high"
    );

    return JSON.parse(responseText);
  }

  /**
   * Create analysis from explicit intent override
   */
  private async createAnalysisFromOverride(
    content: string,
    intentOverride: string
  ): Promise<ContentAnalysis> {
    const prompt = `
The user has specified their intent as: "${intentOverride}"

CONTENT:
${content}

YOUR TASK:
Extract key elements from this content:
- Entities: People, places, organizations, objects
- Temporal: Dates, times, recurring events
- Actions: Verbs, action items, tasks
- Topics: Themes, subjects, domains

Prioritize elements based on the specified intent.

RESPONSE FORMAT (JSON):
{
  "intent": "${intentOverride}",
  "reasoning": "user-specified intent",
  "entities": ["entity1", "entity2"],
  "temporal": ["temporal1", "temporal2"],
  "actions": ["action1", "action2"],
  "topics": ["topic1", "topic2"],
  "priority": ["entities", "temporal", "topics"]
}
`;

let responseText = "";
    await makeModelCall(
      false,
      [{ role: "user", content: prompt }],
      (text) => {
        responseText = text;
      },
      {},
      "high"
    );

    return JSON.parse(responseText);
  }

  /**
   * Phase 2: Perform parallel broad search
   */
  private async performBroadSearch(
    analysis: ContentAnalysis,
    userId: string,
    spaceIds: string[]
  ): Promise<{ facts: any[]; episodes: any[] }> {
    // Build query list based on priority
    const queries: string[] = [];

    // Add queries based on priority order
    for (const category of analysis.priority) {
      switch (category) {
        case "entities":
          queries.push(...analysis.entities.slice(0, 3));
          break;
        case "temporal":
          queries.push(...analysis.temporal.slice(0, 2));
          break;
        case "topics":
          queries.push(...analysis.topics.slice(0, 2));
          break;
        case "actions":
          queries.push(...analysis.actions.slice(0, 2));
          break;
      }
    }

    // Ensure we have at least some queries
    if (queries.length === 0) {
      queries.push(
        ...analysis.entities.slice(0, 2),
        ...analysis.topics.slice(0, 2)
      );
    }

    // Cap at 10 queries max
    const finalQueries = queries.slice(0, 10);

    logger.info(`Broad search: ${finalQueries.length} parallel queries`);

    // Fire all searches in parallel
    const results = await Promise.all(
      finalQueries.map((query) =>
        this.searchService.search(query, userId, {
          limit: 20,
          spaceIds,
        })
      )
    );

    // Flatten and deduplicate facts
    const allFacts = results.flatMap((r) => r.facts);
    const uniqueFacts = Array.from(
      new Map(allFacts.map((f) => [f.fact, f])).values()
    );

    // Flatten and deduplicate episodes
    const allEpisodes = results.flatMap((r) => r.episodes);
    const uniqueEpisodes = Array.from(
      new Map(allEpisodes.map((e) => [`${e.content}-${e.createdAt}`, e])).values()
    );

    return { facts: uniqueFacts, episodes: uniqueEpisodes };
  }

  /**
   * Phase 3: Perform agent-driven deep dive using episodes
   */
  private async performDeepDive(
    content: string,
    analysis: ContentAnalysis,
    broadEpisodes: any[],
    userId: string,
    spaceIds: string[]
  ): Promise<{ facts: any[]; episodes: any[] }> {
    // Check if we have any results worth evaluating
    if (broadEpisodes.length === 0) {
      logger.info("No episodes from broad search, skipping deep dive");
      return { facts: [], episodes: [] };
    }

    // Agent decides on follow-up based on episodes
    const decision = await this.decideFollowUp(
      content,
      analysis,
      broadEpisodes
    );

    if (!decision.shouldContinue) {
      logger.info(`Agent stopped: ${decision.reasoning}`);
      return { facts: [], episodes: [] };
    }

    logger.info(
      `Agent continuing with ${decision.followUpQueries.length} follow-up queries`
    );

    // Execute follow-up queries sequentially
    const deepDiveFacts = [];
    const deepDiveEpisodes = [];

    for (const query of decision.followUpQueries) {
      const result = await this.searchService.search(query, userId, {
        limit: 20,
        spaceIds,
      });

      deepDiveFacts.push(...result.facts);
      deepDiveEpisodes.push(...result.episodes);

      // Stop if we've gathered enough episodes
      if (deepDiveEpisodes.length > 20) {
        logger.info("Sufficient context gathered, stopping early");
        break;
      }
    }

    return { facts: deepDiveFacts, episodes: deepDiveEpisodes };
  }

  /**
   * Agent decides on follow-up queries based on episodes
   */
  private async decideFollowUp(
    content: string,
    analysis: ContentAnalysis,
    episodes: any[]
  ): Promise<AgentDecision> {
    const prompt = `
You are analyzing memory search results to decide if deeper investigation is needed.

ORIGINAL CONTENT:
${content}

INFERRED INTENT: ${analysis.intent}

FOUND MEMORIES (${episodes.length} episodes):
${episodes
  .map((ep, i) => {
    const date = new Date(ep.createdAt).toISOString().split("T")[0];
    const preview = ep.content;
    return `
--- Memory ${i + 1} (${date}) ---
${preview}
`;
  })
  .join("\n")}

YOUR TASK:
1. EVALUATE MEMORY RELEVANCE:
   - Are these memories directly relevant to the original content?
   - Do they provide sufficient context for the intent "${analysis.intent}"?
   - What key information or connections are missing?
   - Are there entities, topics, or concepts mentioned that warrant deeper exploration?

2. DECIDE ON FOLLOW-UP:
   - If memories are highly relevant and complete: STOP, no follow-up needed
   - If memories are relevant but incomplete: Continue with 1-2 clarifying queries
   - If memories reveal new entities/topics worth exploring: Continue with 2-3 follow-up queries
   - If memories are sparse or off-topic: STOP, unlikely to find better results

3. GENERATE FOLLOW-UP QUERIES (if continuing):
   - Extract new entities, topics, or connections mentioned in the memories
   - Formulate specific, targeted queries based on what's missing
   - Focus on enriching context for the "${analysis.intent}" intent
   - Maximum 3 queries

RESPONSE FORMAT (JSON):
{
  "shouldContinue": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "explanation of decision based on memory analysis",
  "followUpQueries": ["query1", "query2"]
}
`;

    let responseText = "";
    await makeModelCall(
      false,
      [{ role: "user", content: prompt }],
      (text) => {
        responseText = text;
      },
      {},
      "high"
    );

    return JSON.parse(responseText);
  }

  /**
   * Phase 4: Synthesize results based on intent using episodes
   */
  private async synthesizeResults(
    content: string,
    analysis: ContentAnalysis,
    episodes: any[]
  ): Promise<string> {
    if (episodes.length === 0) {
      return "No relevant context found in memory.";
    }

    const prompt = `
You are synthesizing relevant context from the user's memory to help an AI assistant respond more effectively.

CURRENT CONTENT:
${content}

USER INTENT: ${analysis.intent}

RELEVANT MEMORY CONTEXT (${episodes.length} past conversations):
${episodes
  .map((ep, i) => {
    const date = new Date(ep.createdAt).toISOString().split("T")[0];
    const preview = ep.content;
    return `
[${date}]
${preview}
`;
  })
  .join("\n\n")}

SYNTHESIS OBJECTIVE:
${this.getIntentGuidance(analysis.intent)}

OUTPUT REQUIREMENTS:
- Provide clear, actionable context from the memories
- Start directly with relevant information, no meta-commentary
- Present facts, decisions, preferences, and patterns from past conversations
- Connect past context to current content when relevant
- Note any gaps, contradictions, or evolution in thinking
- Keep it factual and concise - this will be used by an AI assistant
- Do not use conversational language like "you said" or "you mentioned"
- Present information in third person or as direct facts

Good examples:
- "Previous discussions on X covered Y and Z. Key decision: ..."
- "From March 2024 conversation: [specific context]"
- "Related work on [project] established that..."
- "Past preferences indicate..."
- "Timeline: [sequence of events/decisions]"
`;

    let synthesis = "";
    await makeModelCall(
      false,
      [{ role: "user", content: prompt }],
      (text) => {
        synthesis = text;
      },
      {},
      "high"
    );

    return synthesis;
  }

  /**
   * Get synthesis guidance based on intent keywords
   */
  private getIntentGuidance(intent: string): string {
    const intentLower = intent.toLowerCase();

    if (
      intentLower.includes("read") ||
      intentLower.includes("understand") ||
      intentLower.includes("email")
    ) {
      return "Focus on: Who/what is this about? What context should the reader know? Provide recognition and background.";
    }

    if (
      intentLower.includes("writ") ||
      intentLower.includes("draft") ||
      intentLower.includes("blog") ||
      intentLower.includes("post")
    ) {
      return "Focus on: What has been said before on this topic? What's consistent with past statements? What gaps or contradictions exist?";
    }

    if (
      intentLower.includes("meeting") ||
      intentLower.includes("prep") ||
      intentLower.includes("standup") ||
      intentLower.includes("agenda")
    ) {
      return "Focus on: Key discussion topics, recent relevant context, pending action items, what needs to be addressed.";
    }

    if (
      intentLower.includes("research") ||
      intentLower.includes("explore") ||
      intentLower.includes("learn")
    ) {
      return "Focus on: Patterns across memories, connections between topics, insights and evolution over time.";
    }

    if (
      intentLower.includes("follow") ||
      intentLower.includes("task") ||
      intentLower.includes("todo") ||
      intentLower.includes("action")
    ) {
      return "Focus on: Action items, pending tasks, decisions made, what needs follow-up, deadlines.";
    }

    if (
      intentLower.includes("review") ||
      intentLower.includes("change") ||
      intentLower.includes("update") ||
      intentLower.includes("diff")
    ) {
      return "Focus on: What has changed, what's new information, how things have evolved, timeline of updates.";
    }

    // Default
    return "Focus on: Most relevant context and key insights that would be valuable for understanding this content.";
  }

  /**
   * Generate context hints from metadata
   */
  private getIntentHints(
    metadata?: DeepSearchRequest["metadata"]
  ): string {
    if (!metadata) return "";

    const hints: string[] = [];

    // Chrome extension context
    if (metadata.source === "chrome") {
      if (metadata.url?.includes("mail.google.com")) {
        hints.push("Content is from email client (likely reading)");
      }
      if (metadata.url?.includes("calendar.google.com")) {
        hints.push("Content is from calendar (likely meeting_prep)");
      }
      if (metadata.url?.includes("docs.google.com")) {
        hints.push("Content is from document editor (likely writing)");
      }
    }

    // Obsidian context
    if (metadata.source === "obsidian") {
      hints.push(
        "Content is from note editor (could be writing or research)"
      );
    }

    return hints.length > 0
      ? `\n\nCONTEXT HINTS:\n${hints.join("\n")}`
      : "";
  }
}
