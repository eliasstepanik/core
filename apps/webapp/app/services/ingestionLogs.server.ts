import { prisma } from "~/db.server";
import { getEpisode } from "./graphModels/episode";
import { getSpacesForEpisodes } from "./graphModels/space";

export async function getIngestionLogs(
  userId: string,
  page: number = 1,
  limit: number = 10,
) {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    include: {
      Workspace: true,
    },
  });

  const skip = (page - 1) * limit;

  const [ingestionLogs, total] = await Promise.all([
    prisma.ingestionQueue.findMany({
      where: {
        workspaceId: user?.Workspace?.id,
      },
      skip,
      take: limit,
      orderBy: {
        createdAt: "desc",
      },
    }),
    prisma.ingestionQueue.count({
      where: {
        workspaceId: user?.Workspace?.id,
      },
    }),
  ]);

  return {
    ingestionLogs,
    pagination: {
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      limit,
    },
  };
}

export const getIngestionQueue = async (id: string) => {
  return await prisma.ingestionQueue.findUnique({
    where: {
      id,
    },
  });
};

export const getIngestionQueueForFrontend = async (
  id: string,
  userId: string,
) => {
  // Fetch the specific log by logId
  const log = await prisma.ingestionQueue.findUnique({
    where: { id: id },
    select: {
      id: true,
      createdAt: true,
      processedAt: true,
      status: true,
      error: true,
      type: true,
      output: true,
      data: true,
      workspaceId: true,
      activity: {
        select: {
          text: true,
          sourceURL: true,
          integrationAccount: {
            select: {
              integrationDefinition: {
                select: {
                  name: true,
                  slug: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!log) {
    throw new Response("Log not found", { status: 404 });
  }

  // Format the response
  const integrationDef =
    log.activity?.integrationAccount?.integrationDefinition;
  const logData = log.data as any;

  const formattedLog: any = {
    id: log.id,
    source: integrationDef?.name || logData?.source || "Unknown",
    ingestText:
      log.activity?.text ||
      logData?.episodeBody ||
      logData?.text ||
      "No content",
    time: log.createdAt,
    processedAt: log.processedAt,
    episodeUUID: (log.output as any)?.episodeUuid,
    status: log.status,
    error: log.error,
    sourceURL: log.activity?.sourceURL,
    integrationSlug: integrationDef?.slug,
    data: log.data,
  };

  // Fetch space data based on log type
  if (logData?.type === "CONVERSATION" && formattedLog?.episodeUUID) {
    // For CONVERSATION type: get spaceIds for the single episode
    const spacesMap = await getSpacesForEpisodes(
      [formattedLog.episodeUUID],
      userId,
    );
    formattedLog.spaceIds = spacesMap[formattedLog.episodeUUID] || [];
  } else if (
    logData?.type === "DOCUMENT" &&
    (log.output as any)?.episodes?.length > 0
  ) {
    // For DOCUMENT type: get episode details and space information for all episodes
    const episodeIds = (log.output as any)?.episodes;

    // Fetch all episode details in parallel
    const episodeDetailsPromises = episodeIds.map((episodeId: string) =>
      getEpisode(episodeId).catch(() => null),
    );
    const episodeDetails = await Promise.all(episodeDetailsPromises);

    // Get spaceIds for all episodes
    const spacesMap = await getSpacesForEpisodes(episodeIds, userId);

    // Combine episode details with space information
    formattedLog.episodeDetails = episodeIds.map(
      (episodeId: string, index: number) => {
        const episode = episodeDetails[index];
        return {
          uuid: episodeId,
          content: episode?.content || episode?.originalContent || "No content",
          spaceIds: spacesMap[episodeId] || [],
        };
      },
    );
  }

  return formattedLog;
};

export const getLogByEpisode = async (episodeUuid: string) => {
  // Find logs where the episode UUID matches either:
  // 1. log.output.episodeUuid (single episode - CONVERSATION type)
  // 2. log.output.episodes array (multiple episodes - DOCUMENT type)
  const logs = await prisma.ingestionQueue.findMany({
    where: {
      OR: [
        {
          output: {
            path: ["episodeUuid"],
            equals: episodeUuid,
          },
        },
        {
          output: {
            path: ["episodes"],
            array_contains: episodeUuid,
          },
        },
      ],
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 1,
  });

  return logs[0] || null;
};

export const deleteIngestionQueue = async (id: string) => {
  return await prisma.ingestionQueue.delete({
    where: {
      id,
    },
  });
};
