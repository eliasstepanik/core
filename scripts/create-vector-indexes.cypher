// Drop existing vector indexes if they exist (to handle dimension mismatches)
DROP INDEX entity_embedding IF EXISTS;
DROP INDEX statement_embedding IF EXISTS;
DROP INDEX episode_embedding IF EXISTS;

// Create vector indexes with 1536 dimensions (for text-embedding-3-small)
// Change the vector.dimensions value if using a different embedding model:
// - text-embedding-3-small: 1536
// - text-embedding-3-large: 3072
// - mxbai-embed-large (Ollama): 1024

CREATE VECTOR INDEX entity_embedding IF NOT EXISTS FOR (n:Entity) ON n.nameEmbedding
OPTIONS {indexConfig: {`vector.dimensions`: 1536, `vector.similarity_function`: 'cosine', `vector.hnsw.ef_construction`: 400, `vector.hnsw.m`: 32}};

CREATE VECTOR INDEX statement_embedding IF NOT EXISTS FOR (n:Statement) ON n.factEmbedding
OPTIONS {indexConfig: {`vector.dimensions`: 1536, `vector.similarity_function`: 'cosine', `vector.hnsw.ef_construction`: 400, `vector.hnsw.m`: 32}};

CREATE VECTOR INDEX episode_embedding IF NOT EXISTS FOR (n:Episode) ON n.contentEmbedding
OPTIONS {indexConfig: {`vector.dimensions`: 1536, `vector.similarity_function`: 'cosine', `vector.hnsw.ef_construction`: 400, `vector.hnsw.m`: 32}};

// Verify indexes were created
SHOW INDEXES YIELD name, type WHERE type = 'VECTOR' RETURN name, type;
