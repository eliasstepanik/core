import { z } from "zod";
import { createActionApiRoute } from "~/services/routeBuilders/apiBuilder.server";
import { SpaceService } from "~/services/space.server";
import { json } from "@remix-run/node";
import { getSpaceEpisodeCount } from "~/services/graphModels/space";

const spaceService = new SpaceService();

// Schema for space ID parameter
const SpaceParamsSchema = z.object({
  spaceId: z.string(),
});

const { loader } = createActionApiRoute(
  {
    params: SpaceParamsSchema,
    allowJWT: true,
    authorization: {
      action: "search",
    },
    corsStrategy: "all",
  },
  async ({ authentication, params }) => {
    const userId = authentication.userId;
    const { spaceId } = params;

    // Verify space exists and belongs to user
    const space = await spaceService.getSpace(spaceId, userId);
    if (!space) {
      return json({ error: "Space not found" }, { status: 404 });
    }

    // Get episodes in the space
    const episodes = await spaceService.getSpaceEpisodes(spaceId, userId);
    const episodeCount = await getSpaceEpisodeCount(spaceId, userId);

    return json({
      episodes,
      space: {
        uuid: space.uuid,
        name: space.name,
        description: space.description,
        episodeCount,
      }
    });
  }
);

export { loader };
