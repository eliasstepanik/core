// Check vector index configuration including dimensions
SHOW INDEXES
YIELD name, type, labelsOrTypes, properties, options
WHERE type = 'VECTOR'
RETURN
  name,
  type,
  labelsOrTypes,
  properties,
  options.indexConfig AS indexConfig;

// Specifically check the dimensions
SHOW INDEXES
YIELD name, options
WHERE name IN ['entity_embedding', 'statement_embedding', 'episode_embedding']
RETURN
  name,
  options.indexConfig['vector.dimensions'] AS dimensions,
  options.indexConfig['vector.similarity_function'] AS similarity;
