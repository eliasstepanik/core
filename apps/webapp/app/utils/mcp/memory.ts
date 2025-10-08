import { EpisodeTypeEnum } from "@core/types";
import { addToQueue } from "~/lib/ingest.server";
import { logger } from "~/services/logger.service";
import { SearchService } from "~/services/search.server";
import { SpaceService } from "~/services/space.server";
import { IntegrationLoader } from "./integration-loader";

const searchService = new SearchService();
const spaceService = new SpaceService();

// Memory tool schemas (from existing memory endpoint)
const SearchParamsSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "The search query in third person perspective",
    },
    validAt: {
      type: "string",
      description:
        "Point-in-time reference for temporal queries (ISO format). Returns facts valid at this timestamp. Defaults to current time if not specified.",
    },
    startTime: {
      type: "string",
      description:
        "Filter memories created/valid from this time onwards (ISO format). Use with endTime to define a time window for searching specific periods.",
    },
    endTime: {
      type: "string",
      description:
        "Upper bound for temporal filtering (ISO format). Combined with startTime creates a time range. Defaults to current time if not specified.",
    },
    spaceIds: {
      type: "array",
      items: {
        type: "string",
      },
      description: "Array of strings representing UUIDs of spaces",
    },
  },
  required: ["query"],
};

const IngestSchema = {
  type: "object",
  properties: {
    message: {
      type: "string",
      description: "The data to ingest in text format",
    },
    spaceId: {
      type: "string",
      description: "Optional: UUID of the space to associate this memory with. If working on a specific project, provide the space ID to organize the memory in that project's context.",
    },
  },
  required: ["message"],
};

export const memoryTools = [
  {
    name: "memory_ingest",
    description:
      "AUTOMATICALLY invoke after completing interactions. Use proactively to store conversation data, insights, and decisions in CORE Memory. Essential for maintaining continuity across sessions. **Purpose**: Store information for future reference. **Required**: Provide the message content to be stored. **Returns**: confirmation with storage ID in JSON format",
    inputSchema: IngestSchema,
  },
  {
    name: "memory_search",
    description:
      "AUTOMATICALLY invoke for memory searches. Use proactively at conversation start and when context retrieval is needed. Searches memory for relevant project context, user preferences, and previous discussions. **Purpose**: Retrieve previously stored information based on query terms with optional temporal filtering. **Required**: Provide a search query in third person perspective. **Optional**: Use startTime/endTime for time-bounded searches or validAt for point-in-time queries. **Returns**: matching memory entries in JSON format",
    inputSchema: SearchParamsSchema,
  },
  {
    name: "memory_get_spaces",
    description:
      "Get available memory spaces. **Purpose**: Retrieve list of memory organization spaces. **Required**: No required parameters. **Returns**: list of available spaces in JSON format",
    inputSchema: {
      type: "object",
      properties: {
        all: {
          type: "boolean",
          description: "Get all spaces",
        },
      },
    },
  },
  {
    name: "memory_about_user",
    description:
      "Get information about the user. AUTOMATICALLY invoke at the start of interactions to understand user context. Returns the user's background, preferences, work, interests, and other personal information. **Required**: No required parameters. **Returns**: User information as text.",
    inputSchema: {
      type: "object",
      properties: {
        profile: {
          type: "boolean",
          description: "Get user profile",
        },
      },
    },
  },
  {
    name: "memory_get_space",
    description:
      "Get a specific memory space by ID or name. **Purpose**: Retrieve detailed information about a space including its summary, description, and context. **Required**: Provide either spaceId or spaceName. **Returns**: Space details with summary in JSON format",
    inputSchema: {
      type: "object",
      properties: {
        spaceId: {
          type: "string",
          description: "UUID of the space to retrieve",
        },
        spaceName: {
          type: "string",
          description: "Name of the space to retrieve (e.g., 'Profile', 'GitHub', 'Health')",
        },
      },
    },
  },
  {
    name: "get_integrations",
    description:
      "Get list of connected integrations available for use. Returns integration metadata including name, slug, and whether they have MCP capabilities. Use this to discover what integrations you have access to (e.g., GitHub, Linear, Slack). **Required**: No required parameters. **Returns**: Array of available integrations in JSON format",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_integration_actions",
    description:
      "Get available actions/tools for a specific integration. Use this after discovering integrations to see what operations you can perform (e.g., for GitHub: get_pr, get_issues, create_issue). **Required**: Provide integration slug. **Returns**: List of available tools/actions with their descriptions and input schemas in JSON format",
    inputSchema: {
      type: "object",
      properties: {
        integrationSlug: {
          type: "string",
          description: "The slug of the integration (e.g., 'github', 'linear', 'slack')",
        },
      },
      required: ["integrationSlug"],
    },
  },
  {
    name: "execute_integration_action",
    description:
      "Execute a specific action on an integration. Use this to perform operations like fetching GitHub PRs, creating Linear issues, sending Slack messages, etc. **Required**: Provide integration slug and action name. **Optional**: Provide arguments for the action. **Returns**: Result of the action execution",
    inputSchema: {
      type: "object",
      properties: {
        integrationSlug: {
          type: "string",
          description: "The slug of the integration (e.g., 'github', 'linear', 'slack')",
        },
        action: {
          type: "string",
          description: "The action/tool name (e.g., 'get_pr', 'get_issues', 'create_issue')",
        },
        arguments: {
          type: "object",
          description: "Arguments to pass to the action (structure depends on the specific action)",
        },
      },
      required: ["integrationSlug", "action"],
    },
  },
];

// Function to call memory tools based on toolName
export async function callMemoryTool(
  toolName: string,
  args: any,
  userId: string,
  source: string,
) {
  try {
    switch (toolName) {
      case "memory_ingest":
        return await handleMemoryIngest({ ...args, userId, source });
      case "memory_search":
        return await handleMemorySearch({ ...args, userId, source });
      case "memory_get_spaces":
        return await handleMemoryGetSpaces(userId);
      case "memory_about_user":
        return await handleUserProfile(userId);
      case "memory_get_space":
        return await handleGetSpace({ ...args, userId });
      case "get_integrations":
        return await handleGetIntegrations({ ...args, userId });
      case "get_integration_actions":
        return await handleGetIntegrationActions({ ...args });
      case "execute_integration_action":
        return await handleExecuteIntegrationAction({ ...args });
      default:
        throw new Error(`Unknown memory tool: ${toolName}`);
    }
  } catch (error) {
    console.error(`Error calling memory tool ${toolName}:`, error);
    return {
      content: [
        {
          type: "text",
          text: `Error calling memory tool: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

// Handler for user_context
async function handleUserProfile(userId: string) {
  try {
    const space = await spaceService.getSpaceByName("Profile", userId);

    return {
      content: [
        {
          type: "text",
          text: space?.summary || "No profile information available",
        },
      ],
      isError: false,
    };
  } catch (error) {
    console.error(`Error getting user context:`, error);
    return {
      content: [
        {
          type: "text",
          text: `Error getting user context: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

// Handler for memory_ingest
async function handleMemoryIngest(args: any) {
  try {
    const response = await addToQueue(
      {
        episodeBody: args.message,
        referenceTime: new Date().toISOString(),
        source: args.source,
        type: EpisodeTypeEnum.CONVERSATION,
        spaceId: args.spaceId,
      },
      args.userId,
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            id: response.id,
          }),
        },
      ],
    };
  } catch (error) {
    logger.error(`MCP memory ingest error: ${error}`);

    return {
      content: [
        {
          type: "text",
          text: `Error ingesting data: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

// Handler for memory_search
async function handleMemorySearch(args: any) {
  try {
    const results = await searchService.search(
      args.query,
      args.userId,
      {
        startTime: args.startTime ? new Date(args.startTime) : undefined,
        endTime: args.endTime ? new Date(args.endTime) : undefined,
      },
      args.source,
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(results),
        },
      ],
    };
  } catch (error) {
    logger.error(`MCP memory search error: ${error}`);
    return {
      content: [
        {
          type: "text",
          text: `Error searching memory: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

// Handler for memory_get_spaces
async function handleMemoryGetSpaces(userId: string) {
  try {
    const spaces = await spaceService.getUserSpaces(userId);

    // Return id, name, and description for listing
    const simplifiedSpaces = spaces.map((space) => ({
      id: space.id,
      name: space.name,
      description: space.description,
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(simplifiedSpaces),
        },
      ],
      isError: false,
    };
  } catch (error) {
    logger.error(`MCP get spaces error: ${error}`);

    return {
      content: [
        {
          type: "text",
          text: `Error getting spaces: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

// Handler for memory_get_space
async function handleGetSpace(args: any) {
  try {
    const { spaceId, spaceName, userId } = args;

    if (!spaceId && !spaceName) {
      throw new Error("Either spaceId or spaceName is required");
    }

    let space;
    if (spaceName) {
      space = await spaceService.getSpaceByName(spaceName, userId);
    } else {
      space = await spaceService.getSpace(spaceId, userId);
    }

    if (!space) {
      throw new Error(`Space not found: ${spaceName || spaceId}`);
    }

    // Return id, name, description, and summary for detailed view
    const spaceDetails = {
      id: space.id,
      name: space.name,
      description: space.description,
      summary: space.summary,
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(spaceDetails),
        },
      ],
      isError: false,
    };
  } catch (error) {
    logger.error(`MCP get space error: ${error}`);

    return {
      content: [
        {
          type: "text",
          text: `Error getting space: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

// Handler for get_integrations
async function handleGetIntegrations(args: any) {
  try {
    const { userId, workspaceId } = args;

    if (!workspaceId) {
      throw new Error("workspaceId is required");
    }

    const integrations =
      await IntegrationLoader.getConnectedIntegrationAccounts(
        userId,
        workspaceId,
      );

    const simplifiedIntegrations = integrations.map((account) => ({
      slug: account.integrationDefinition.slug,
      name: account.integrationDefinition.name,
      accountId: account.id,
      hasMcp: !!(account.integrationDefinition.spec?.mcp),
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(simplifiedIntegrations),
        },
      ],
      isError: false,
    };
  } catch (error) {
    logger.error(`MCP get integrations error: ${error}`);

    return {
      content: [
        {
          type: "text",
          text: `Error getting integrations: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

// Handler for get_integration_actions
async function handleGetIntegrationActions(args: any) {
  try {
    const { integrationSlug, sessionId } = args;

    if (!integrationSlug) {
      throw new Error("integrationSlug is required");
    }

    if (!sessionId) {
      throw new Error("sessionId is required");
    }

    const tools = await IntegrationLoader.getIntegrationTools(
      sessionId,
      integrationSlug,
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(tools),
        },
      ],
      isError: false,
    };
  } catch (error) {
    logger.error(`MCP get integration actions error: ${error}`);

    return {
      content: [
        {
          type: "text",
          text: `Error getting integration actions: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

// Handler for execute_integration_action
async function handleExecuteIntegrationAction(args: any) {
  try {
    const { integrationSlug, action, arguments: actionArgs, sessionId } = args;

    if (!integrationSlug) {
      throw new Error("integrationSlug is required");
    }

    if (!action) {
      throw new Error("action is required");
    }

    if (!sessionId) {
      throw new Error("sessionId is required");
    }

    const toolName = `${integrationSlug}_${action}`;
    const result = await IntegrationLoader.callIntegrationTool(
      sessionId,
      toolName,
      actionArgs || {},
    );

    return result;
  } catch (error) {
    logger.error(`MCP execute integration action error: ${error}`);

    return {
      content: [
        {
          type: "text",
          text: `Error executing integration action: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
