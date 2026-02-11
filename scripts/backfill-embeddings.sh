#!/bin/bash

# TARX Embedding Backfill Script (Shell version)
# Uses sqlite3 CLI and curl to generate embeddings

DB_PATH="/Users/master/Library/Application Support/tarx/memory.db"
EMBED_URL="http://localhost:11437/v1/embeddings"

echo "============================================================"
echo "TARX EMBEDDING BACKFILL"
echo "============================================================"
echo "Database: $DB_PATH"
echo "Embedding Server: $EMBED_URL"
echo ""

# Check embedding server
if ! curl -s "$EMBED_URL/../health" > /dev/null 2>&1; then
  echo "ERROR: Embedding server not available"
  exit 1
fi
echo "Embedding server: ONLINE"
echo ""

# Create message_embeddings table if needed
sqlite3 "$DB_PATH" <<EOF
CREATE TABLE IF NOT EXISTS message_embeddings (
  message_id TEXT PRIMARY KEY,
  embedding BLOB NOT NULL,
  model TEXT DEFAULT 'nomic-embed-text-v1.5',
  dimensions INTEGER DEFAULT 768,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_message_embeddings_created ON message_embeddings(created_at);
EOF

# Get counts
TOTAL_MSGS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM messages;")
MSGS_WITH_EMBED=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM message_embeddings;" 2>/dev/null || echo "0")
echo "Messages: $MSGS_WITH_EMBED/$TOTAL_MSGS have embeddings"

# Get messages without embeddings
echo ""
echo "=== BACKFILLING MESSAGE EMBEDDINGS ==="

PROCESSED=0
ERRORS=0

# Get messages without embeddings (limit to 100 for safety)
sqlite3 "$DB_PATH" "SELECT m.id, SUBSTR(m.content, 1, 2000) FROM messages m LEFT JOIN message_embeddings me ON m.id = me.message_id WHERE me.message_id IS NULL AND m.content IS NOT NULL AND LENGTH(m.content) > 0 ORDER BY m.created_at DESC LIMIT 100;" | while IFS='|' read -r MSG_ID CONTENT; do
  if [ -z "$MSG_ID" ]; then
    continue
  fi

  # Escape content for JSON
  ESCAPED_CONTENT=$(echo "$CONTENT" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | tr '\n' ' ' | cut -c1-2000)

  # Generate embedding
  RESPONSE=$(curl -s "$EMBED_URL" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"nomic-embed-text-v1.5\",\"input\":\"search_document: $ESCAPED_CONTENT\"}" 2>/dev/null)

  if echo "$RESPONSE" | grep -q '"embedding"'; then
    # Extract embedding array (simplified - just check if it worked)
    EMBEDDING_JSON=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d['data'][0]['embedding']))" 2>/dev/null)

    if [ -n "$EMBEDDING_JSON" ]; then
      # Convert to binary blob using Python
      BLOB_HEX=$(echo "$EMBEDDING_JSON" | python3 -c "
import sys, struct, json
arr = json.load(sys.stdin)
blob = struct.pack('<' + 'f' * len(arr), *arr)
print(blob.hex())
" 2>/dev/null)

      if [ -n "$BLOB_HEX" ]; then
        # Insert into database
        sqlite3 "$DB_PATH" "INSERT OR REPLACE INTO message_embeddings (message_id, embedding, model, dimensions, created_at) VALUES ('$MSG_ID', X'$BLOB_HEX', 'nomic-embed-text-v1.5', 768, $(date +%s)000);"
        PROCESSED=$((PROCESSED + 1))
        echo "OK: $MSG_ID"
      else
        ERRORS=$((ERRORS + 1))
        echo "ERROR: $MSG_ID (blob conversion)"
      fi
    else
      ERRORS=$((ERRORS + 1))
      echo "ERROR: $MSG_ID (embedding extraction)"
    fi
  else
    ERRORS=$((ERRORS + 1))
    echo "ERROR: $MSG_ID (API call)"
  fi

  sleep 0.1
done

echo ""
echo "============================================================"
echo "BACKFILL COMPLETE"
echo "============================================================"

# Final stats
FINAL_EMBED=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM message_embeddings;" 2>/dev/null || echo "0")
echo "Messages with embeddings: $MSGS_WITH_EMBED -> $FINAL_EMBED"
