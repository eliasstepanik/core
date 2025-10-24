// Check all Neo4j indexes
SHOW INDEXES;

// Check specifically for vector indexes
SHOW INDEXES YIELD name, type WHERE type = 'VECTOR' RETURN name, type;

// Check for specific vector indexes we need
SHOW INDEXES YIELD name WHERE name IN ['entity_embedding', 'statement_embedding', 'episode_embedding'] RETURN name;
