import { z } from "zod";
import { json } from "@remix-run/node";
import { createActionApiRoute } from "~/services/routeBuilders/apiBuilder.server";
import { DeepSearchService } from "~/services/deepSearch.server";
import { SearchService } from "~/services/search.server";

const DeepSearchBodySchema = z.object({
  content: z.string().min(1, "Content is required"),
  intentOverride: z.string().optional(),
  metadata: z
    .object({
      source: z.enum(["chrome", "obsidian", "mcp"]).optional(),
      url: z.string().optional(),
      pageTitle: z.string().optional(),
    })
    .optional(),
});

const { action, loader } = createActionApiRoute(
  {
    body: DeepSearchBodySchema,
    method: "POST",
    allowJWT: true,
    authorization: {
      action: "search",
    },
    corsStrategy: "all",
  },
  async ({ body, authentication }) => {
    const searchService = new SearchService();
    const deepSearchService = new DeepSearchService(searchService);

    const result = await deepSearchService.deepSearch(
      body,
      authentication.userId
    );

    return json(result);
  }
);

export { action, loader };
