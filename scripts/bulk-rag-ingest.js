#!/usr/bin/env node
/**
 * TARX Bulk RAG Ingest Script
 *
 * Uploads all .md files from /tmp/tarx-knowledge-parts/ to TARX RAG system.
 * Uses embedding server on port 11437 and stores in memory.db.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');

// Configuration
const KNOWLEDGE_DIR = '/tmp/tarx-knowledge-parts';
const EMBEDDING_URL = 'http://localhost:11437/v1/embeddings';
const DB_PATH = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');
const SPACE_ID = '4690883b-33b5-491b-af7c-91bee7c97723';
const CHUNK_SIZE = 512;
const CHUNK_OVERLAP = 128;
const EMBEDDING_MODEL = 'nomic-embed';

// Check for better-sqlite3
let Database;
try {
  Database = require('better-sqlite3');
} catch (err) {
  console.error('ERROR: better-sqlite3 not found. Installing...');
  const { execSync } = require('child_process');
  try {
    execSync('npm install better-sqlite3', { stdio: 'inherit', cwd: __dirname });
    Database = require('better-sqlite3');
  } catch (installErr) {
    console.error('Failed to install better-sqlite3:', installErr.message);
    process.exit(1);
  }
}

/**
 * Chunk text with overlap
 */
function chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end);

    if (chunk.trim().length > 0) {
      chunks.push(chunk);
    }

    // Move forward by (chunkSize - overlap)
    start += (chunkSize - overlap);

    // Prevent infinite loop on last small chunk
    if (start + overlap >= text.length && end === text.length) {
      break;
    }
  }

  return chunks;
}

/**
 * Get embedding from local server
 */
async function getEmbedding(text) {
  const response = await fetch(EMBEDDING_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: `search_document: ${text}`,
      model: EMBEDDING_MODEL
    })
  });

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Extract embedding array (should be 768-dim)
  const embedding = data.data?.[0]?.embedding;
  if (!embedding || !Array.isArray(embedding)) {
    throw new Error('Invalid embedding response format');
  }

  return embedding;
}

/**
 * Convert float array to Buffer for BLOB storage
 */
function embeddingToBuffer(embedding) {
  const buffer = Buffer.allocUnsafe(embedding.length * 4);
  for (let i = 0; i < embedding.length; i++) {
    buffer.writeFloatLE(embedding[i], i * 4);
  }
  return buffer;
}

/**
 * Main ingestion function
 */
async function ingestFiles() {
  console.log('🚀 TARX Bulk RAG Ingest Starting...\n');

  // Check knowledge directory
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    console.error(`ERROR: Directory not found: ${KNOWLEDGE_DIR}`);
    process.exit(1);
  }

  // Get all .md files
  const files = fs.readdirSync(KNOWLEDGE_DIR)
    .filter(f => f.endsWith('.md'))
    .sort();

  if (files.length === 0) {
    console.error(`ERROR: No .md files found in ${KNOWLEDGE_DIR}`);
    process.exit(1);
  }

  console.log(`📁 Found ${files.length} files to ingest`);

  // Check database
  if (!fs.existsSync(DB_PATH)) {
    console.error(`ERROR: Database not found: ${DB_PATH}`);
    process.exit(1);
  }

  // Open database
  const db = new Database(DB_PATH);

  // Ensure knowledge_embeddings table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_embeddings (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK(source_type IN ('file', 'message', 'note', 'url')),
      source_id TEXT,
      title TEXT,
      content TEXT NOT NULL,
      embedding BLOB NOT NULL,
      model TEXT,
      original_dimensions INTEGER,
      stored_dimensions INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_space ON knowledge_embeddings(space_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_source ON knowledge_embeddings(source_type, source_id);
  `);

  // Prepare insert statement
  const insertStmt = db.prepare(`
    INSERT INTO knowledge_embeddings (
      id, space_id, source_type, source_id, title, content,
      embedding, model, original_dimensions, stored_dimensions,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let totalChunks = 0;
  let totalFiles = 0;

  // Process each file
  for (const filename of files) {
    const filePath = path.join(KNOWLEDGE_DIR, filename);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Extract title from first line (usually # heading in markdown)
    const firstLine = content.split('\n')[0];
    const title = firstLine.startsWith('#')
      ? firstLine.replace(/^#+\s*/, '').trim()
      : filename.replace('.md', '');

    // Chunk the content
    const chunks = chunkText(content);

    console.log(`\n📄 Processing [${totalFiles + 1}/${files.length}]: ${filename}`);
    console.log(`   Title: ${title}`);
    console.log(`   Chunks: ${chunks.length}`);

    // Generate unique file ID for source_id
    const fileId = randomUUID();

    // Process each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      try {
        // Get embedding
        const embedding = await getEmbedding(chunk);
        const embeddingBuffer = embeddingToBuffer(embedding);

        // Insert into database
        const now = Date.now();
        insertStmt.run(
          randomUUID(),                    // id
          SPACE_ID,                        // space_id
          'file',                          // source_type
          fileId,                          // source_id
          title,                           // title
          chunk,                           // content
          embeddingBuffer,                 // embedding
          EMBEDDING_MODEL,                 // model
          embedding.length,                // original_dimensions
          embedding.length,                // stored_dimensions
          now,                             // created_at
          now                              // updated_at
        );

        totalChunks++;

        // Progress indicator
        if ((i + 1) % 5 === 0 || i === chunks.length - 1) {
          process.stdout.write(`   Progress: ${i + 1}/${chunks.length} chunks\r`);
        }

        // Small delay to avoid overwhelming the embedding server
        await new Promise(resolve => setTimeout(resolve, 10));

      } catch (err) {
        console.error(`\n   ❌ Error on chunk ${i + 1}: ${err.message}`);
      }
    }

    console.log(`   ✅ Completed: ${chunks.length} chunks embedded`);
    totalFiles++;
  }

  db.close();

  console.log('\n' + '='.repeat(60));
  console.log('✅ BULK INGEST COMPLETE');
  console.log('='.repeat(60));
  console.log(`📊 Total files uploaded: ${totalFiles}/${files.length}`);
  console.log(`📊 Total chunks embedded: ${totalChunks}`);
  console.log(`📊 Database: ${DB_PATH}`);
  console.log(`📊 Space ID: ${SPACE_ID}`);
  console.log('='.repeat(60));
}

// Run the script
ingestFiles().catch(err => {
  console.error('\n❌ FATAL ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});
