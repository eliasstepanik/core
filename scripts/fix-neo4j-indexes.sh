#!/bin/bash

# Script to fix Neo4j vector indexes
# This script recreates the vector indexes with the correct dimensions

set -e

echo "========================================="
echo "Neo4j Vector Index Fix Script"
echo "========================================="
echo ""

# Default values
NEO4J_URI=${NEO4J_URI:-"bolt://localhost:7687"}
NEO4J_USERNAME=${NEO4J_USERNAME:-"neo4j"}
NEO4J_PASSWORD=${NEO4J_PASSWORD:-""}

# Check if running in Docker
if [ -f "/.dockerenv" ] || [ -f "/run/.containerenv" ]; then
    echo "Running inside Docker container"
    NEO4J_URI=${NEO4J_URI:-"bolt://neo4j:7687"}
fi

echo "Neo4j URI: $NEO4J_URI"
echo ""

# Check if cypher-shell is available
if ! command -v cypher-shell &> /dev/null; then
    echo "ERROR: cypher-shell not found!"
    echo ""
    echo "Options:"
    echo "1. Run this script inside the Neo4j container:"
    echo "   docker exec -it <neo4j-container> bash"
    echo "   cd /var/lib/neo4j"
    echo "   /path/to/this/script.sh"
    echo ""
    echo "2. Install Neo4j shell tools locally"
    echo ""
    echo "3. Use Neo4j Browser at http://localhost:7474"
    echo "   and run the queries from: scripts/create-vector-indexes.cypher"
    exit 1
fi

echo "Step 1: Checking current indexes..."
echo "-----------------------------------"
cypher-shell -u "$NEO4J_USERNAME" -p "$NEO4J_PASSWORD" -a "$NEO4J_URI" \
    "SHOW INDEXES YIELD name, type WHERE type = 'VECTOR' RETURN name, type;"
echo ""

echo "Step 2: Dropping existing vector indexes..."
echo "--------------------------------------------"
cypher-shell -u "$NEO4J_USERNAME" -p "$NEO4J_PASSWORD" -a "$NEO4J_URI" \
    "DROP INDEX entity_embedding IF EXISTS; DROP INDEX statement_embedding IF EXISTS; DROP INDEX episode_embedding IF EXISTS;"
echo "Indexes dropped successfully"
echo ""

echo "Step 3: Creating new vector indexes with 1536 dimensions..."
echo "------------------------------------------------------------"

# Read EMBEDDING_MODEL_SIZE from environment or use default
DIMENSIONS=${EMBEDDING_MODEL_SIZE:-1536}
echo "Using $DIMENSIONS dimensions (configure with EMBEDDING_MODEL_SIZE env var)"
echo ""

cypher-shell -u "$NEO4J_USERNAME" -p "$NEO4J_PASSWORD" -a "$NEO4J_URI" <<EOF
CREATE VECTOR INDEX entity_embedding IF NOT EXISTS FOR (n:Entity) ON n.nameEmbedding
OPTIONS {indexConfig: {\`vector.dimensions\`: $DIMENSIONS, \`vector.similarity_function\`: 'cosine', \`vector.hnsw.ef_construction\`: 400, \`vector.hnsw.m\`: 32}};

CREATE VECTOR INDEX statement_embedding IF NOT EXISTS FOR (n:Statement) ON n.factEmbedding
OPTIONS {indexConfig: {\`vector.dimensions\`: $DIMENSIONS, \`vector.similarity_function\`: 'cosine', \`vector.hnsw.ef_construction\`: 400, \`vector.hnsw.m\`: 32}};

CREATE VECTOR INDEX episode_embedding IF NOT EXISTS FOR (n:Episode) ON n.contentEmbedding
OPTIONS {indexConfig: {\`vector.dimensions\`: $DIMENSIONS, \`vector.similarity_function\`: 'cosine', \`vector.hnsw.ef_construction\`: 400, \`vector.hnsw.m\`: 32}};
EOF

echo "Indexes created successfully"
echo ""

echo "Step 4: Verifying new indexes..."
echo "---------------------------------"
cypher-shell -u "$NEO4J_USERNAME" -p "$NEO4J_PASSWORD" -a "$NEO4J_URI" \
    "SHOW INDEXES YIELD name, type, labelsOrTypes, properties WHERE type = 'VECTOR' RETURN name, type, labelsOrTypes, properties;"
echo ""

echo "========================================="
echo "✓ Vector indexes fixed successfully!"
echo "========================================="
echo ""
echo "IMPORTANT: Existing embeddings in your database may have wrong dimensions."
echo "You may need to re-process your data to regenerate embeddings with the new dimensions."
echo ""
