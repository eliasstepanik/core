import { runQuery } from "~/lib/neo4j.server";
import {
  type SpaceNode,
  type SpaceDeletionResult,
  type SpaceAssignmentResult,
} from "@core/types";
import { logger } from "~/services/logger.service";
import { prisma } from "~/trigger/utils/prisma";

/**
 * Create a new space for a user
 */
export async function createSpace(
  spaceId: string,
  name: string,
  description: string | undefined,
  userId: string,
): Promise<SpaceNode> {
  const query = `
    CREATE (s:Space {
      uuid: $spaceId,
      name: $name,
      description: $description,
      userId: $userId,
      createdAt: datetime(),
      updatedAt: datetime(),
      isActive: true
    })
    RETURN s
  `;

  const result = await runQuery(query, { spaceId, name, description, userId });
  if (result.length === 0) {
    throw new Error("Failed to create space");
  }

  const spaceData = result[0].get("s").properties;
  return {
    uuid: spaceData.uuid,
    name: spaceData.name,
    description: spaceData.description,
    userId: spaceData.userId,
    createdAt: new Date(spaceData.createdAt),
    updatedAt: new Date(spaceData.updatedAt),
    isActive: spaceData.isActive,
  };
}

/**
 * Get a specific space by ID
 */
export async function getSpace(
  spaceId: string,
  userId: string,
): Promise<SpaceNode | null> {
  const query = `
    MATCH (s:Space {uuid: $spaceId, userId: $userId})
    WHERE s.isActive = true

    // Count episodes assigned to this space using direct relationship
    OPTIONAL MATCH (s)-[:HAS_EPISODE]->(e:Episode {userId: $userId})

    WITH s, count(e) as episodeCount
    RETURN s, episodeCount
  `;

  const result = await runQuery(query, { spaceId, userId });
  if (result.length === 0) {
    return null;
  }

  const spaceData = result[0].get("s").properties;
  const episodeCount = result[0].get("episodeCount") || 0;

  return {
    uuid: spaceData.uuid,
    name: spaceData.name,
    description: spaceData.description,
    userId: spaceData.userId,
    createdAt: new Date(spaceData.createdAt),
    updatedAt: new Date(spaceData.updatedAt),
    isActive: spaceData.isActive,
    contextCount: Number(episodeCount), // Episode count = context count
  };
}

/**
 * Update a space
 */
export async function updateSpace(
  spaceId: string,
  updates: { name?: string; description?: string },
  userId: string,
): Promise<SpaceNode> {
  const setClause = [];
  const params: any = { spaceId, userId };

  if (updates.name !== undefined) {
    setClause.push("s.name = $name");
    params.name = updates.name;
  }

  if (updates.description !== undefined) {
    setClause.push("s.description = $description");
    params.description = updates.description;
  }

  if (setClause.length === 0) {
    throw new Error("No updates provided");
  }

  setClause.push("s.updatedAt = datetime()");

  const query = `
    MATCH (s:Space {uuid: $spaceId, userId: $userId})
    WHERE s.isActive = true
    SET ${setClause.join(", ")}
    RETURN s
  `;

  const result = await runQuery(query, params);
  if (result.length === 0) {
    throw new Error("Space not found or access denied");
  }

  const spaceData = result[0].get("s").properties;
  return {
    uuid: spaceData.uuid,
    name: spaceData.name,
    description: spaceData.description,
    userId: spaceData.userId,
    createdAt: new Date(spaceData.createdAt),
    updatedAt: new Date(spaceData.updatedAt),
    isActive: spaceData.isActive,
  };
}

/**
 * Delete a space and clean up all statement references
 */
export async function deleteSpace(
  spaceId: string,
  userId: string,
): Promise<SpaceDeletionResult> {
  try {
    // 1. Check if space exists and belongs to user
    const spaceExists = await getSpace(spaceId, userId);
    if (!spaceExists) {
      return { deleted: false, statementsUpdated: 0, error: "Space not found" };
    }

    // 2. Clean up statement references (remove spaceId from spaceIds arrays)
    const cleanupStatementsQuery = `
      MATCH (s:Statement {userId: $userId})
      WHERE s.spaceIds IS NOT NULL AND $spaceId IN s.spaceIds
      SET s.spaceIds = [id IN s.spaceIds WHERE id <> $spaceId]
      RETURN count(s) as updatedStatements
    `;

    const cleanupStatementsResult = await runQuery(cleanupStatementsQuery, { userId, spaceId });
    const updatedStatements = cleanupStatementsResult[0]?.get("updatedStatements") || 0;

    // 3. Clean up episode references (remove spaceId from spaceIds arrays)
    const cleanupEpisodesQuery = `
      MATCH (e:Episode {userId: $userId})
      WHERE e.spaceIds IS NOT NULL AND $spaceId IN e.spaceIds
      SET e.spaceIds = [id IN e.spaceIds WHERE id <> $spaceId]
      RETURN count(e) as updatedEpisodes
    `;

    const cleanupEpisodesResult = await runQuery(cleanupEpisodesQuery, { userId, spaceId });
    const updatedEpisodes = cleanupEpisodesResult[0]?.get("updatedEpisodes") || 0;

    // 4. Delete the space node and all its relationships
    const deleteQuery = `
      MATCH (space:Space {uuid: $spaceId, userId: $userId})
      DETACH DELETE space
      RETURN count(space) as deletedSpaces
    `;

    await runQuery(deleteQuery, { userId, spaceId });

    logger.info(`Deleted space ${spaceId}`, {
      userId,
      statementsUpdated: updatedStatements,
      episodesUpdated: updatedEpisodes,
    });

    return {
      deleted: true,
      statementsUpdated: Number(updatedStatements) + Number(updatedEpisodes),
    };
  } catch (error) {
    return {
      deleted: false,
      statementsUpdated: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Assign statements to a space
 */
export async function assignStatementsToSpace(
  statementIds: string[],
  spaceId: string,
  userId: string,
): Promise<SpaceAssignmentResult> {
  try {
    // Verify space exists and belongs to user
    const space = await getSpace(spaceId, userId);
    if (!space) {
      return {
        success: false,
        statementsUpdated: 0,
        error: "Space not found or access denied",
      };
    }

    const query = `
      MATCH (s:Statement {userId: $userId})
      WHERE s.uuid IN $statementIds
      SET s.spaceIds = CASE 
        WHEN s.spaceIds IS NULL THEN [$spaceId]
        WHEN $spaceId IN s.spaceIds THEN s.spaceIds
        ELSE s.spaceIds + [$spaceId]
      END,
      s.lastSpaceAssignment = datetime(),
      s.spaceAssignmentMethod = CASE 
        WHEN s.spaceAssignmentMethod IS NULL THEN 'manual'
        ELSE s.spaceAssignmentMethod
      END
      RETURN count(s) as updated
    `;

    const result = await runQuery(query, { statementIds, spaceId, userId });
    const updatedCount = result[0]?.get("updated") || 0;

    return {
      success: true,
      statementsUpdated: Number(updatedCount),
    };
  } catch (error) {
    return {
      success: false,
      statementsUpdated: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Remove statements from a space
 */
export async function removeStatementsFromSpace(
  statementIds: string[],
  spaceId: string,
  userId: string,
): Promise<SpaceAssignmentResult> {
  try {
    const query = `
      MATCH (s:Statement {userId: $userId})
      WHERE s.uuid IN $statementIds AND s.spaceIds IS NOT NULL AND $spaceId IN s.spaceIds
      SET s.spaceIds = [id IN s.spaceIds WHERE id <> $spaceId]
      RETURN count(s) as updated
    `;

    const result = await runQuery(query, { statementIds, spaceId, userId });
    const updatedCount = result[0]?.get("updated") || 0;

    return {
      success: true,
      statementsUpdated: Number(updatedCount),
    };
  } catch (error) {
    return {
      success: false,
      statementsUpdated: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get all statements in a space
 */
export async function getSpaceStatements(spaceId: string, userId: string) {
  const query = `
    MATCH (s:Statement {userId: $userId})
    WHERE s.spaceIds IS NOT NULL AND $spaceId IN s.spaceIds AND s.invalidAt IS NULL
    MATCH (s)-[:HAS_SUBJECT]->(subj:Entity)
    MATCH (s)-[:HAS_PREDICATE]->(pred:Entity)
    MATCH (s)-[:HAS_OBJECT]->(obj:Entity)
    RETURN s, subj.name as subject, pred.name as predicate, obj.name as object
    ORDER BY s.createdAt DESC
  `;

  const result = await runQuery(query, { spaceId, userId });

  return result.map((record) => {
    const statement = record.get("s").properties;
    return {
      uuid: statement.uuid,
      fact: statement.fact,
      subject: record.get("subject"),
      predicate: record.get("predicate"),
      object: record.get("object"),
      createdAt: new Date(statement.createdAt),
      validAt: new Date(statement.validAt),
      invalidAt: statement.invalidAt
        ? new Date(statement.invalidAt)
        : undefined,
      spaceIds: statement.spaceIds || [],
      recallCount: statement.recallCount,
    };
  });
}

/**
 * Get real-time statement count for a space from Neo4j
 */
export async function getSpaceStatementCount(
  spaceId: string,
  userId: string,
): Promise<number> {
  const query = `
    MATCH (s:Statement {userId: $userId})
    WHERE s.spaceIds IS NOT NULL 
      AND $spaceId IN s.spaceIds 
    RETURN count(s) as statementCount
  `;

  const result = await runQuery(query, { spaceId, userId });
  return Number(result[0]?.get("statementCount") || 0);
}

/**
 * Initialize spaceIds array for existing statements (migration helper)
 */
export async function initializeStatementSpaceIds(
  userId?: string,
): Promise<number> {
  const query = userId
    ? `
      MATCH (s:Statement {userId: $userId})
      WHERE s.spaceIds IS NULL
      SET s.spaceIds = []
      RETURN count(s) as updated
    `
    : `
      MATCH (s:Statement)
      WHERE s.spaceIds IS NULL
      SET s.spaceIds = []
      RETURN count(s) as updated
    `;

  const result = await runQuery(query, userId ? { userId } : {});
  return Number(result[0]?.get("updated") || 0);
}

/**
 * Assign episodes to a space using intent-based matching
 */
export async function assignEpisodesToSpace(
  episodeIds: string[],
  spaceId: string,
  userId: string,
): Promise<SpaceAssignmentResult> {
  try {
    // Verify space exists and belongs to user
    const space = await getSpace(spaceId, userId);
    if (!space) {
      return {
        success: false,
        statementsUpdated: 0,
        error: "Space not found or access denied",
      };
    }

    // Update episodes with spaceIds array AND create HAS_EPISODE relationships
    // This hybrid approach enables both fast array lookups and graph traversal
    const query = `
      MATCH (space:Space {uuid: $spaceId, userId: $userId})
      MATCH (e:Episode {userId: $userId})
      WHERE e.uuid IN $episodeIds
      SET e.spaceIds = CASE
        WHEN e.spaceIds IS NULL THEN [$spaceId]
        WHEN $spaceId IN e.spaceIds THEN e.spaceIds
        ELSE e.spaceIds + [$spaceId]
      END,
      e.lastSpaceAssignment = datetime(),
      e.spaceAssignmentMethod = CASE
        WHEN e.spaceAssignmentMethod IS NULL THEN 'intent_based'
        ELSE e.spaceAssignmentMethod
      END
      WITH e, space
      MERGE (space)-[r:HAS_EPISODE]->(e)
      ON CREATE SET
        r.assignedAt = datetime(),
        r.assignmentMethod = 'intent_based'
      RETURN count(e) as updated
    `;

    const result = await runQuery(query, { episodeIds, spaceId, userId });
    const updatedCount = result[0]?.get("updated") || 0;

    logger.info(`Assigned ${updatedCount} episodes to space ${spaceId}`, {
      episodeIds: episodeIds.length,
      userId,
    });

    return {
      success: true,
      statementsUpdated: Number(updatedCount),
    };
  } catch (error) {
    logger.error(`Error assigning episodes to space:`, {
      error,
      spaceId,
      episodeIds: episodeIds.length,
    });
    return {
      success: false,
      statementsUpdated: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Remove episodes from a space
 */
export async function removeEpisodesFromSpace(
  episodeIds: string[],
  spaceId: string,
  userId: string,
): Promise<SpaceAssignmentResult> {
  try {
    // Remove from both spaceIds array and HAS_EPISODE relationship
    const query = `
      MATCH (e:Episode {userId: $userId})
      WHERE e.uuid IN $episodeIds AND e.spaceIds IS NOT NULL AND $spaceId IN e.spaceIds
      SET e.spaceIds = [id IN e.spaceIds WHERE id <> $spaceId]
      WITH e
      MATCH (space:Space {uuid: $spaceId, userId: $userId})-[r:HAS_EPISODE]->(e)
      DELETE r
      RETURN count(e) as updated
    `;

    const result = await runQuery(query, { episodeIds, spaceId, userId });
    const updatedCount = result[0]?.get("updated") || 0;

    return {
      success: true,
      statementsUpdated: Number(updatedCount),
    };
  } catch (error) {
    return {
      success: false,
      statementsUpdated: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get all episodes in a space
 */
export async function getSpaceEpisodes(spaceId: string, userId: string) {
  const query = `
    MATCH (space:Space {uuid: $spaceId, userId: $userId})-[:HAS_EPISODE]->(e:Episode {userId: $userId})
    RETURN e
    ORDER BY e.createdAt DESC
  `;

  const result = await runQuery(query, { spaceId, userId });

  return result.map((record) => {
    const episode = record.get("e").properties;
    return {
      uuid: episode.uuid,
      content: episode.content,
      originalContent: episode.originalContent,
      source: episode.source,
      createdAt: new Date(episode.createdAt),
      validAt: new Date(episode.validAt),
      metadata: JSON.parse(episode.metadata || "{}"),
      sessionId: episode.sessionId,
    };
  });
}

/**
 * Get episode count for a space
 */
export async function getSpaceEpisodeCount(
  spaceId: string,
  userId: string,
): Promise<number> {
  // Use spaceIds array for faster lookup instead of relationship traversal
  const query = `
    MATCH (e:Episode {userId: $userId})
    WHERE e.spaceIds IS NOT NULL AND $spaceId IN e.spaceIds
    RETURN count(e) as episodeCount
  `;

  const result = await runQuery(query, { spaceId, userId });
  return Number(result[0]?.get("episodeCount") || 0);
}
