import type { EntityNode, StatementNode, EpisodicNode } from "@core/types";
import type { SearchOptions } from "../search.server";
import type { Embedding } from "ai";
import { logger } from "../logger.service";
import { runQuery, cosineSimilarityCypher } from "~/lib/neo4j.server";
import { getEmbedding } from "~/lib/model.server";
import { findSimilarEntities } from "../graphModels/entity";

/**
 * Perform BM25 keyword-based search on statements
 */
export async function performBM25Search(
  query: string,
  userId: string,
  options: Required<SearchOptions>,
): Promise<StatementNode[]> {
  try {
    // Sanitize the query for Lucene syntax
    const sanitizedQuery = sanitizeLuceneQuery(query);

    // Build the WHERE clause based on timeframe options
    let timeframeCondition = `
      AND s.validAt <= $validAt
      ${options.includeInvalidated ? '' : 'AND (s.invalidAt IS NULL OR s.invalidAt > $validAt)'}
    `;

    // If startTime is provided, add condition to filter by validAt >= startTime
    if (options.startTime) {
      timeframeCondition = `
        AND s.validAt <= $validAt
        ${options.includeInvalidated ? '' : 'AND (s.invalidAt IS NULL OR s.invalidAt > $validAt)'}
        AND s.validAt >= $startTime
      `;
    }

    // Add space filtering if spaceIds are provided
    let spaceCondition = "";
    if (options.spaceIds.length > 0) {
      spaceCondition = `
        AND s.spaceIds IS NOT NULL AND ANY(spaceId IN $spaceIds WHERE spaceId IN s.spaceIds)
      `;
    }

    // Use Neo4j's built-in fulltext search capabilities with provenance count
    const cypher = `
        CALL db.index.fulltext.queryNodes("statement_fact_index", $query) 
        YIELD node AS s, score
        WHERE 
          (s.userId = $userId)
          ${timeframeCondition}
          ${spaceCondition}
        OPTIONAL MATCH (episode:Episode)-[:HAS_PROVENANCE]->(s)
        WITH s, score, count(episode) as provenanceCount
        RETURN s, score, provenanceCount
        ORDER BY score DESC
      `;

    const params = {
      query: sanitizedQuery,
      userId,
      validAt: options.endTime.toISOString(),
      ...(options.startTime && { startTime: options.startTime.toISOString() }),
      ...(options.spaceIds.length > 0 && { spaceIds: options.spaceIds }),
    };

    const records = await runQuery(cypher, params);
    return records.map((record) => {
      const statement = record.get("s").properties as StatementNode;
      const provenanceCountValue = record.get("provenanceCount");
      statement.provenanceCount =
        typeof provenanceCountValue === "bigint"
          ? Number(provenanceCountValue)
          : (provenanceCountValue?.toNumber?.() ?? provenanceCountValue ?? 0);
      return statement;
    });
  } catch (error) {
    logger.error("BM25 search error:", { error });
    return [];
  }
}

/**
 * Sanitize a query string for Lucene syntax
 */
export function sanitizeLuceneQuery(query: string): string {
  // Escape special characters: + - && || ! ( ) { } [ ] ^ " ~ * ? : \ /
  let sanitized = query.replace(
    /[+\-&|!(){}[\]^"~*?:\\\/]/g,
    (match) => "\\" + match,
  );

  // If query is too long, truncate it
  const MAX_QUERY_LENGTH = 32;
  const words = sanitized.split(" ");
  if (words.length > MAX_QUERY_LENGTH) {
    sanitized = words.slice(0, MAX_QUERY_LENGTH).join(" ");
  }

  return sanitized;
}

/**
 * Perform vector similarity search on statement embeddings
 */
export async function performVectorSearch(
  query: Embedding,
  userId: string,
  options: Required<SearchOptions>,
): Promise<StatementNode[]> {
  try {
    // Build the WHERE clause based on timeframe options
    let timeframeCondition = `
      AND s.validAt <= $validAt
      ${options.includeInvalidated ? '' : 'AND (s.invalidAt IS NULL OR s.invalidAt > $validAt)'}
    `;

    // If startTime is provided, add condition to filter by validAt >= startTime
    if (options.startTime) {
      timeframeCondition = `
        AND s.validAt <= $validAt
        ${options.includeInvalidated ? '' : 'AND (s.invalidAt IS NULL OR s.invalidAt > $validAt)'}
        AND s.validAt >= $startTime
      `;
    }

    // Add space filtering if spaceIds are provided
    let spaceCondition = "";
    if (options.spaceIds.length > 0) {
      spaceCondition = `
        AND s.spaceIds IS NOT NULL AND ANY(spaceId IN $spaceIds WHERE spaceId IN s.spaceIds)
      `;
    }

    const limit = options.limit || 100;
    // 1. Search for similar statements using native Cypher cosine similarity with provenance count
    const cypher = `
    MATCH (s:Statement)
    WHERE s.userId = $userId
    ${timeframeCondition}
    ${spaceCondition}
    WITH s, ${cosineSimilarityCypher('s.factEmbedding', '$embedding')} AS score
    WHERE score >= 0.5
    OPTIONAL MATCH (episode:Episode)-[:HAS_PROVENANCE]->(s)
    WITH s, score, count(episode) as provenanceCount
    RETURN s, score, provenanceCount
    ORDER BY score DESC
    LIMIT ${limit}
  `;

    const params = {
      embedding: query,
      userId,
      validAt: options.endTime.toISOString(),
      ...(options.startTime && { startTime: options.startTime.toISOString() }),
      ...(options.spaceIds.length > 0 && { spaceIds: options.spaceIds }),
    };

    const records = await runQuery(cypher, params);
    return records.map((record) => {
      const statement = record.get("s").properties as StatementNode;
      const provenanceCountValue = record.get("provenanceCount");
      statement.provenanceCount =
        typeof provenanceCountValue === "bigint"
          ? Number(provenanceCountValue)
          : (provenanceCountValue?.toNumber?.() ?? provenanceCountValue ?? 0);
      return statement;
    });
  } catch (error) {
    logger.error("Vector search error:", { error });
    return [];
  }
}

/**
 * Perform BFS traversal starting from entities mentioned in the query
 * Uses guided search with semantic filtering to reduce noise
 */
export async function performBfsSearch(
  query: string,
  embedding: Embedding,
  userId: string,
  options: Required<SearchOptions>,
): Promise<StatementNode[]> {
  try {
    // 1. Extract potential entities from query using chunked embeddings
    const entities = await extractEntitiesFromQuery(query, userId);

    if (entities.length === 0) {
      return [];
    }

    // 2. Perform guided BFS with semantic filtering
    const statements = await bfsTraversal(
      entities,
      embedding,
      options.maxBfsDepth || 3,
      options.endTime,
      userId,
      options.includeInvalidated,
      options.startTime,
    );

    // Return individual statements
    return statements;
  } catch (error) {
    logger.error("BFS search error:", { error });
    return [];
  }
}


/**
 * Iterative BFS traversal - explores up to 3 hops level-by-level using Neo4j cosine similarity
 */
async function bfsTraversal(
  startEntities: EntityNode[],
  queryEmbedding: Embedding,
  maxDepth: number,
  validAt: Date,
  userId: string,
  includeInvalidated: boolean,
  startTime: Date | null,
): Promise<StatementNode[]> {
  const RELEVANCE_THRESHOLD = 0.5;
  const EXPLORATION_THRESHOLD = 0.3;

  const allStatements = new Map<string, number>(); // uuid -> relevance
  const visitedEntities = new Set<string>();

  // Track entities per level for iterative BFS
  let currentLevelEntities = startEntities.map(e => e.uuid);

  // Timeframe condition for temporal filtering
  let timeframeCondition = `
    AND s.validAt <= $validAt
    ${includeInvalidated ? '' : 'AND (s.invalidAt IS NULL OR s.invalidAt > $validAt)'}
  `;
  if (startTime) {
    timeframeCondition += ` AND s.validAt >= $startTime`;
  }

  // Process each depth level
  for (let depth = 0; depth < maxDepth; depth++) {
    if (currentLevelEntities.length === 0) break;

    // Mark entities as visited at this depth
    currentLevelEntities.forEach(id => visitedEntities.add(`${id}`));

    // Get statements for current level entities with cosine similarity calculated in Neo4j
    const cypher = `
      MATCH (e:Entity{userId: $userId})-[:HAS_SUBJECT|HAS_OBJECT|HAS_PREDICATE]-(s:Statement{userId: $userId})
      WHERE e.uuid IN $entityIds
        ${timeframeCondition}
      WITH DISTINCT s  // Deduplicate first
      WITH s, ${cosineSimilarityCypher('s.factEmbedding', '$queryEmbedding')} AS relevance
      WHERE relevance >= $explorationThreshold
      RETURN s.uuid AS uuid, relevance
      ORDER BY relevance DESC
      LIMIT 200  // Cap per BFS level to avoid explosion
    `;

    const records = await runQuery(cypher, {
      entityIds: currentLevelEntities,
      userId,
      queryEmbedding,
      explorationThreshold: EXPLORATION_THRESHOLD,
      validAt: validAt.toISOString(),
      ...(startTime && { startTime: startTime.toISOString() }),
    });

    // Store statement relevance scores
    const currentLevelStatementUuids: string[] = [];
    for (const record of records) {
      const uuid = record.get("uuid");
      const relevance = record.get("relevance");

      if (!allStatements.has(uuid)) {
        allStatements.set(uuid, relevance);
        currentLevelStatementUuids.push(uuid);
      }
    }

    // Get connected entities for next level
    if (depth < maxDepth - 1 && currentLevelStatementUuids.length > 0) {
      const nextCypher = `
        MATCH (s:Statement{userId: $userId})-[:HAS_SUBJECT|HAS_OBJECT|HAS_PREDICATE]->(e:Entity{userId: $userId})
        WHERE s.uuid IN $statementUuids
        RETURN DISTINCT e.uuid AS entityId
      `;

      const nextRecords = await runQuery(nextCypher, {
        statementUuids: currentLevelStatementUuids,
        userId
      });

      // Filter out already visited entities
      currentLevelEntities = nextRecords
        .map(r => r.get("entityId"))
        .filter(id => !visitedEntities.has(`${id}`));

    } else {
      currentLevelEntities = [];
    }
  }

  // Filter by relevance threshold and fetch full statements
  const relevantUuids = Array.from(allStatements.entries())
    .filter(([_, relevance]) => relevance >= RELEVANCE_THRESHOLD)
    .sort((a, b) => b[1] - a[1])
    .map(([uuid]) => uuid);

  if (relevantUuids.length === 0) {
    return [];
  }

  const fetchCypher = `
    MATCH (s:Statement{userId: $userId})
    WHERE s.uuid IN $uuids
    RETURN s
  `;
  const fetchRecords = await runQuery(fetchCypher, { uuids: relevantUuids, userId });
  const statements = fetchRecords.map(r => r.get("s").properties as StatementNode);

  logger.info(
    `BFS: explored ${allStatements.size} statements across ${maxDepth} hops, returning ${statements.length} (≥${RELEVANCE_THRESHOLD})`
  );

  return statements;
}


/**
 * Generate query chunks (individual words and bigrams) for entity extraction
 */
function generateQueryChunks(query: string): string[] {
  const words = query.toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0);

  const chunks: string[] = [];

  // Add individual words (for entities like "user")
  chunks.push(...words);

  // Add bigrams (for multi-word entities like "home address")
  for (let i = 0; i < words.length - 1; i++) {
    chunks.push(`${words[i]} ${words[i + 1]}`);
  }

  // Add full query as final chunk
  chunks.push(query.toLowerCase().trim());

  return chunks;
}

/**
 * Extract potential entities from a query using chunked embeddings
 * Chunks query into words/bigrams, embeds each chunk, finds entities for each
 */
export async function extractEntitiesFromQuery(
  query: string,
  userId: string,
): Promise<EntityNode[]> {
  try {
    // Generate chunks from query
    const chunks = generateQueryChunks(query);

    // Get embeddings for each chunk
    const chunkEmbeddings = await Promise.all(
      chunks.map(chunk => getEmbedding(chunk))
    );

    // Search for entities matching each chunk embedding
    const allEntitySets = await Promise.all(
      chunkEmbeddings.map(async (embedding) => {
        return await findSimilarEntities({
          queryEmbedding: embedding,
          limit: 3,
          threshold: 0.7,
          userId,
        });
      })
    );

    // Flatten and deduplicate entities by ID
    const allEntities = allEntitySets.flat();
    const uniqueEntities = Array.from(
      new Map(allEntities.map(e => [e.uuid, e])).values()
    );

    return uniqueEntities;
  } catch (error) {
    logger.error("Entity extraction error:", { error });
    return [];
  }
}

/**
 * Combine and deduplicate statements from different search methods
 */
export function combineAndDeduplicateStatements(
  statements: StatementNode[],
): StatementNode[] {
  return Array.from(
    new Map(
      statements.map((statement) => [statement.uuid, statement]),
    ).values(),
  );
}

export async function getEpisodesByStatements(
  statements: StatementNode[],
): Promise<EpisodicNode[]> {
  const cypher = `
    MATCH (s:Statement)<-[:HAS_PROVENANCE]-(e:Episode)
    WHERE s.uuid IN $statementUuids
    RETURN distinct e
  `;

  const params = {
    statementUuids: statements.map((s) => s.uuid),
  };

  const records = await runQuery(cypher, params);
  return records.map((record) => record.get("e").properties as EpisodicNode);
}
