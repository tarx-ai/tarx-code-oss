/**
 * TARX Embedding Backfill Script
 *
 * Generates embeddings for all messages and files that don't have them yet.
 * Uses the llama-server embedding endpoint on port 11437.
 */

const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const EMBEDDING_URL = 'http://localhost:11437/v1/embeddings';
const DB_PATH = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');
const BATCH_SIZE = 10;
const DELAY_MS = 100;

async function generateEmbedding(text) {
  try {
    // Prefix for nomic-embed-text (search_document for indexing)
    const prefixedText = `search_document: ${text}`;

    const response = await fetch(EMBEDDING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'nomic-embed-text-v1.5',
        input: prefixedText
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data[0].embedding;
  } catch (error) {
    console.error(`Embedding error: ${error.message}`);
    return null;
  }
}

function floatArrayToBuffer(arr) {
  const buffer = Buffer.alloc(arr.length * 4);
  arr.forEach((val, i) => buffer.writeFloatLE(val, i * 4));
  return buffer;
}

async function backfillMessageEmbeddings(db) {
  console.log('\n=== BACKFILLING MESSAGE EMBEDDINGS ===\n');

  // Get messages without embeddings
  const messages = db.prepare(`
    SELECT m.id, m.content, m.session_id
    FROM messages m
    LEFT JOIN message_embeddings me ON m.id = me.message_id
    WHERE me.message_id IS NULL
    AND m.content IS NOT NULL
    AND LENGTH(m.content) > 0
    ORDER BY m.created_at DESC
    LIMIT 500
  `).all();

  console.log(`Found ${messages.length} messages without embeddings`);

  // Check if message_embeddings table exists
  const tableExists = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name='message_embeddings'
  `).get();

  if (!tableExists) {
    console.log('Creating message_embeddings table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS message_embeddings (
        message_id TEXT PRIMARY KEY,
        embedding BLOB NOT NULL,
        model TEXT DEFAULT 'nomic-embed-text-v1.5',
        dimensions INTEGER DEFAULT 768,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_message_embeddings_created ON message_embeddings(created_at);
    `);
  }

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO message_embeddings (message_id, embedding, model, dimensions, created_at)
    VALUES (?, ?, 'nomic-embed-text-v1.5', 768, ?)
  `);

  let processed = 0;
  let errors = 0;

  for (const msg of messages) {
    // Truncate content to reasonable length
    const content = msg.content.substring(0, 8000);

    const embedding = await generateEmbedding(content);

    if (embedding) {
      const buffer = floatArrayToBuffer(embedding);
      insertStmt.run(msg.id, buffer, Date.now());
      processed++;
    } else {
      errors++;
    }

    if ((processed + errors) % 10 === 0) {
      console.log(`Progress: ${processed + errors}/${messages.length} (${processed} OK, ${errors} errors)`);
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log(`\nMessage embeddings complete: ${processed} processed, ${errors} errors`);
  return { processed, errors };
}

async function backfillKnowledgeEmbeddings(db) {
  console.log('\n=== BACKFILLING KNOWLEDGE EMBEDDINGS ===\n');

  // Get knowledge entries without embeddings
  const entries = db.prepare(`
    SELECT id, content, title
    FROM knowledge_embeddings
    WHERE embedding IS NULL OR LENGTH(embedding) = 0
    LIMIT 100
  `).all();

  console.log(`Found ${entries.length} knowledge entries without embeddings`);

  const updateStmt = db.prepare(`
    UPDATE knowledge_embeddings
    SET embedding = ?, dimensions = 768
    WHERE id = ?
  `);

  let processed = 0;
  let errors = 0;

  for (const entry of entries) {
    const text = entry.title ? `${entry.title}\n\n${entry.content}` : entry.content;
    const embedding = await generateEmbedding(text.substring(0, 8000));

    if (embedding) {
      const buffer = floatArrayToBuffer(embedding);
      updateStmt.run(buffer, entry.id);
      processed++;
    } else {
      errors++;
    }

    if ((processed + errors) % 5 === 0) {
      console.log(`Progress: ${processed + errors}/${entries.length}`);
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log(`\nKnowledge embeddings complete: ${processed} processed, ${errors} errors`);
  return { processed, errors };
}

async function main() {
  console.log('='.repeat(60));
  console.log('TARX EMBEDDING BACKFILL');
  console.log('='.repeat(60));
  console.log(`Database: ${DB_PATH}`);
  console.log(`Embedding Server: ${EMBEDDING_URL}`);
  console.log('');

  // Check embedding server
  try {
    const health = await fetch('http://localhost:11437/health');
    if (!health.ok) throw new Error('Server not healthy');
    console.log('Embedding server: ONLINE');
  } catch (e) {
    console.error('ERROR: Embedding server not available at port 11437');
    console.error('Start it with: llama-server --model <nomic-path> --port 11437 --embeddings --pooling mean');
    process.exit(1);
  }

  // Open database
  const db = new Database(DB_PATH);

  // Get current stats
  const stats = {
    totalMessages: db.prepare('SELECT COUNT(*) as count FROM messages').get().count,
    messagesWithEmbeddings: db.prepare('SELECT COUNT(*) as count FROM message_embeddings').pluck().get() || 0,
    totalKnowledge: db.prepare('SELECT COUNT(*) as count FROM knowledge_embeddings').get().count,
    knowledgeWithEmbeddings: db.prepare('SELECT COUNT(*) as count FROM knowledge_embeddings WHERE embedding IS NOT NULL AND LENGTH(embedding) > 0').get().count
  };

  console.log('\nCurrent Status:');
  console.log(`Messages: ${stats.messagesWithEmbeddings}/${stats.totalMessages} have embeddings`);
  console.log(`Knowledge: ${stats.knowledgeWithEmbeddings}/${stats.totalKnowledge} have embeddings`);

  // Run backfill
  const startTime = Date.now();

  const msgResult = await backfillMessageEmbeddings(db);
  const knowledgeResult = await backfillKnowledgeEmbeddings(db);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Final stats
  const finalStats = {
    messagesWithEmbeddings: db.prepare('SELECT COUNT(*) as count FROM message_embeddings').pluck().get() || 0,
    knowledgeWithEmbeddings: db.prepare('SELECT COUNT(*) as count FROM knowledge_embeddings WHERE embedding IS NOT NULL AND LENGTH(embedding) > 0').get().count
  };

  console.log('\n' + '='.repeat(60));
  console.log('BACKFILL COMPLETE');
  console.log('='.repeat(60));
  console.log(`Time elapsed: ${elapsed}s`);
  console.log(`Messages: ${stats.messagesWithEmbeddings} -> ${finalStats.messagesWithEmbeddings}`);
  console.log(`Knowledge: ${stats.knowledgeWithEmbeddings} -> ${finalStats.knowledgeWithEmbeddings}`);
  console.log(`New embeddings: ${msgResult.processed + knowledgeResult.processed}`);
  console.log(`Errors: ${msgResult.errors + knowledgeResult.errors}`);

  db.close();
}

main().catch(console.error);
