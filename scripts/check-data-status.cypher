// Check if there's any data in Neo4j for debugging

// 1. Count all nodes by type
MATCH (n)
WHERE n.userId IS NOT NULL
RETURN labels(n)[0] AS nodeType, count(n) AS count
ORDER BY count DESC;

// 2. Check recent episodes
MATCH (e:Episode)
WHERE e.userId IS NOT NULL
RETURN e.uuid, e.content, e.createdAt, e.spaceIds, e.validAt
ORDER BY e.createdAt DESC
LIMIT 5;

// 3. Check if episodes have statements
MATCH (e:Episode)-[:HAS_PROVENANCE]->(s:Statement)
WHERE e.userId IS NOT NULL
RETURN count(e) AS episodesWithStatements;

// 4. Check entities
MATCH (ent:Entity)
WHERE ent.userId IS NOT NULL
RETURN ent.uuid, ent.name, ent.type
LIMIT 10;

// 5. Check for complete triplets (Episode -> Statement -> Subject/Predicate/Object)
MATCH (e:Episode)-[:HAS_PROVENANCE]->(s:Statement)
MATCH (s)-[:HAS_SUBJECT]->(subj:Entity)
MATCH (s)-[:HAS_PREDICATE]->(pred:Entity)
MATCH (s)-[:HAS_OBJECT]->(obj:Entity)
WHERE e.userId IS NOT NULL
RETURN count(*) AS completeTriplets;
