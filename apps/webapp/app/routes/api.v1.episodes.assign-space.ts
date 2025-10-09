import { z } from "zod";
import { createHybridActionApiRoute } from "~/services/routeBuilders/apiBuilder.server";
import { SpaceService } from "~/services/space.server";
import { json } from "@remix-run/node";

const spaceService = new SpaceService();

// Schema for assigning episodes to space
const AssignEpisodesSchema = z.object({
  episodeIds: z.string().transform((val) => JSON.parse(val) as string[]),
  spaceId: z.string(),
  action: z.enum(["assign", "remove"]),
});

const { action } = createHybridActionApiRoute(
  {
    body: AssignEpisodesSchema,
    allowJWT: true,
    authorization: {
      action: "manage",
    },
    corsStrategy: "all",
  },
  async ({ authentication, body }) => {
    const userId = authentication.userId;
    const { episodeIds, spaceId, action: actionType } = body;

    try {
      if (actionType === "assign") {
        await spaceService.assignEpisodesToSpace(episodeIds, spaceId, userId);
        return json({
          success: true,
          message: `Successfully assigned ${episodeIds.length} episode(s) to space`,
        });
      } else if (actionType === "remove") {
        await spaceService.removeEpisodesFromSpace(episodeIds, spaceId, userId);
        return json({
          success: true,
          message: `Successfully removed ${episodeIds.length} episode(s) from space`,
        });
      }

      return json(
        {
          error: "Invalid action type",
          success: false,
        },
        { status: 400 },
      );
    } catch (error) {
      console.error("Error managing episode space assignment:", error);
      return json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to manage episode space assignment",
          success: false,
        },
        { status: 500 },
      );
    }
  },
);

export { action };
