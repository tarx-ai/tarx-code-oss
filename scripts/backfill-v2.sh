#!/bin/bash

# TARX Embedding Backfill v2
# Uses correct schema for message_embeddings table

DB_PATH="/Users/master/Library/Application Support/tarx/memory.db"
EMBED_URL="http://localhost:11437/v1/embeddings"

echo "============================================================"
echo "TARX EMBEDDING BACKFILL v2"
echo "============================================================"

# Check server
if ! curl -s "http://localhost:11437/health" > /dev/null; then
  echo "ERROR: Embedding server not available"
  exit 1
fi
echo "Embedding server: ONLINE"

# Get messages without embeddings
MSGS=$(sqlite3 "$DB_PATH" "SELECT m.id FROM messages m LEFT JOIN message_embeddings me ON m.id = me.message_id WHERE me.message_id IS NULL AND m.content IS NOT NULL LIMIT 200;")

TOTAL=$(echo "$MSGS" | grep -c .)
echo "Messages to process: $TOTAL"
echo ""

PROCESSED=0
ERRORS=0

for MSG_ID in $MSGS; do
  # Get content
  CONTENT=$(sqlite3 "$DB_PATH" "SELECT SUBSTR(content, 1, 4000) FROM messages WHERE id='$MSG_ID';" | tr -d '\n' | sed "s/'/''/g")

  if [ -z "$CONTENT" ]; then
    continue
  fi

  # Generate embedding
  RESPONSE=$(curl -s "$EMBED_URL" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"nomic-embed-text-v1.5\",\"input\":\"search_document: $CONTENT\"}" 2>/dev/null)

  if echo "$RESPONSE" | grep -q '"embedding"'; then
    # Convert to zero-padded binary
    BLOB_HEX=$(echo "$RESPONSE" | python3 -c "
import sys, struct, json
try:
    d = json.load(sys.stdin)
    arr = d['data'][0]['embedding']
    while len(arr) < 1024:
        arr.append(0.0)
    blob = struct.pack('<' + 'f' * 1024, *arr[:1024])
    print(blob.hex())
except:
    pass
" 2>/dev/null)

    if [ -n "$BLOB_HEX" ] && [ ${#BLOB_HEX} -eq 8192 ]; then
      EMBED_ID="embed_$(date +%s%N | cut -c1-13)_$(head /dev/urandom | LC_ALL=C tr -dc 'a-z0-9' | head -c 8)"

      sqlite3 "$DB_PATH" "INSERT OR REPLACE INTO message_embeddings (id, message_id, embedding, model, original_dimensions, stored_dimensions, created_at) VALUES ('$EMBED_ID', '$MSG_ID', X'$BLOB_HEX', 'nomic-embed-text-v1.5', 768, 1024, $(date +%s)000);" 2>/dev/null

      if [ $? -eq 0 ]; then
        PROCESSED=$((PROCESSED + 1))
        echo "[$PROCESSED/$TOTAL] OK: $MSG_ID"
      else
        ERRORS=$((ERRORS + 1))
        echo "[$PROCESSED/$TOTAL] ERROR: $MSG_ID (insert)"
      fi
    else
      ERRORS=$((ERRORS + 1))
      echo "ERROR: $MSG_ID (blob)"
    fi
  else
    ERRORS=$((ERRORS + 1))
    echo "ERROR: $MSG_ID (api)"
  fi

  sleep 0.05
done

echo ""
echo "============================================================"
echo "COMPLETE"
echo "============================================================"
echo "Processed: $PROCESSED"
echo "Errors: $ERRORS"
sqlite3 "$DB_PATH" "SELECT COUNT(*) as 'Total embeddings:' FROM message_embeddings;"
