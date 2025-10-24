# Neo4j Index Management Scripts

Scripts to manage and fix Neo4j vector indexes for the CORE application.

## Problem

If you're seeing errors like:
```
Failed to invoke procedure `db.index.vector.queryNodes`:
Caused by: java.lang.IllegalArgumentException: There is no such vector schema index: entity_embedding
```

Or:
```
Index query vector has 1536 dimensions, but indexed vectors have 1024.
```

These scripts will help you fix the issue.

## Prerequisites

Before running these scripts, ensure:
1. `EMBEDDING_MODEL_SIZE` is set correctly in your `.env` file (1536 for text-embedding-3-small)
2. Neo4j is running and accessible
3. You have the Neo4j credentials

## Option 1: Quick Fix (Recommended)

### Using Docker

If you're running Neo4j in Docker:

```bash
# Set your Neo4j password
export NEO4J_PASSWORD="your-neo4j-password"

# Run the fix script inside the Neo4j container
docker exec -it <neo4j-container-name> \
  bash -c "NEO4J_PASSWORD=$NEO4J_PASSWORD /path/to/fix-neo4j-indexes.sh"
```

Or copy the script into the container:

```bash
# From the core directory
docker cp scripts/fix-neo4j-indexes.sh <neo4j-container-name>:/tmp/
docker exec -it <neo4j-container-name> bash

# Inside the container:
export NEO4J_PASSWORD="your-password"
bash /tmp/fix-neo4j-indexes.sh
```

### Using cypher-shell locally

If you have cypher-shell installed:

```bash
export NEO4J_URI="bolt://localhost:7687"
export NEO4J_USERNAME="neo4j"
export NEO4J_PASSWORD="your-password"
export EMBEDDING_MODEL_SIZE="1536"  # or 1024 for mxbai-embed-large

./scripts/fix-neo4j-indexes.sh
```

## Option 2: Manual Fix via Neo4j Browser

1. Open Neo4j Browser at http://localhost:7474
2. Login with your Neo4j credentials
3. Copy and paste the contents of `scripts/create-vector-indexes.cypher`
4. Execute the queries

**Note:** If using a different embedding model, update the `vector.dimensions` value in the script:
- `text-embedding-3-small`: 1536
- `text-embedding-3-large`: 3072
- `mxbai-embed-large`: 1024

## Checking Index Status

To verify your indexes are correct:

### Via Neo4j Browser

```cypher
SHOW INDEXES YIELD name, type, labelsOrTypes, properties
WHERE type = 'VECTOR'
RETURN name, type, labelsOrTypes, properties;
```

### Via cypher-shell

```bash
cypher-shell -u neo4j -p your-password -a bolt://localhost:7687 \
  "SHOW INDEXES YIELD name, type WHERE type = 'VECTOR' RETURN name, type;"
```

## After Fixing Indexes

1. **Restart your application** to ensure it picks up the new indexes
2. **Clear old data** (optional but recommended):
   - If you had existing entities/episodes with embeddings in the wrong dimension, they won't work with the new indexes
   - Either delete and re-ingest your data, or run a migration to re-embed existing data

## Troubleshooting

### "cypher-shell not found"

Install Neo4j shell tools or use Neo4j Browser instead.

### "Connection refused"

- Check if Neo4j is running: `docker ps | grep neo4j`
- Verify the Neo4j URI is correct
- Check if Neo4j port (7687) is accessible

### "Authentication failed"

- Verify your Neo4J password matches your configuration
- Check the NEO4J_PASSWORD environment variable

### Indexes created but still getting errors

- Make sure `EMBEDDING_MODEL_SIZE=1536` is in your `.env` file
- Restart the application completely: `docker-compose restart webapp`
- Check application logs for startup errors

## Understanding the Scripts

### check-neo4j-indexes.cypher
Read-only queries to check index status. Safe to run anytime.

### create-vector-indexes.cypher
Drops and recreates vector indexes with 1536 dimensions. Edit the dimension value if using a different embedding model.

### fix-neo4j-indexes.sh
Automated bash script that:
1. Checks current indexes
2. Drops existing vector indexes
3. Creates new indexes with correct dimensions
4. Verifies the fix
