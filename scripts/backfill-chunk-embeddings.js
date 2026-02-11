#!/usr/bin/env node
/**
 * TARX Chunk Embeddings Backfill Script
 *
 * Reads ALL rows from the `files` table, chunks each file (512 chars, 128 overlap),
 * POSTs each chunk to localhost:11437/v1/embeddings with search_document prefix,
 * inserts into chunk_embeddings table.
 *
 * Usage: node scripts/backfill-chunk-embeddings.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');

// Configuration
const DB_PATH = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');
const FILES_DIR = path.join(os.homedir(), 'Library/Application Support/tarx/files');
const EMBEDDING_URL = 'http://localhost:11437/v1/embeddings';
const CHUNK_SIZE = 512;
const CHUNK_OVERLAP = 128;
const EMBEDDING_MODEL = 'nomic-embed';

// Check for better-sqlite3
let Database;
try {
  Database = require('better-sqlite3');
} catch (err) {
  console.error('ERROR: better-sqlite3 not found. Install it:');
  console.error('  cd scripts && npm install better-sqlite3');
  process.exit(1);
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

    // Prevent infinite loop on last chunk
    if (end === text.length) {
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
 * Main function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('TARX CHUNK EMBEDDINGS BACKFILL');
  console.log('='.repeat(60));
  console.log(`Database: ${DB_PATH}`);
  console.log(`Files dir: ${FILES_DIR}`);
  console.log(`Embedding server: ${EMBEDDING_URL}`);
  console.log(`Chunk size: ${CHUNK_SIZE}, Overlap: ${CHUNK_OVERLAP}`);
  console.log('');

  // Verify embedding server is up
  try {
    const testEmbed = await getEmbedding('test');
    console.log(`Embedding server: ONLINE (${testEmbed.length} dimensions)`);
  } catch (err) {
    console.error('ERROR: Embedding server not available:', err.message);
    console.error('Make sure llama-server is running on port 11437');
    process.exit(1);
  }

  // Open database
  const db = new Database(DB_PATH);

  // Get initial counts
  const initialFileCount = db.prepare('SELECT COUNT(*) as count FROM files WHERE deleted_at IS NULL').get().count;
  const initialEmbeddingCount = db.prepare('SELECT COUNT(*) as count FROM chunk_embeddings').get().count;

  console.log(`\nFiles in database: ${initialFileCount}`);
  console.log(`Existing chunk embeddings: ${initialEmbeddingCount}`);

  // Clear existing embeddings if starting fresh
  if (initialEmbeddingCount > 0) {
    console.log('\nClearing existing chunk_embeddings...');
    db.prepare('DELETE FROM chunk_embeddings').run();
    console.log('Cleared.');
  }

  // Get all files
  const files = db.prepare(`
    SELECT id, filename, storage_path, size_bytes
    FROM files
    WHERE deleted_at IS NULL
    ORDER BY created_at ASC
  `).all();

  console.log(`\nProcessing ${files.length} files...\n`);

  // Prepare insert statement
  const insertStmt = db.prepare(`
    INSERT INTO chunk_embeddings (id, file_id, chunk_index, content, embedding, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let totalChunks = 0;
  let processedFiles = 0;
  let errors = 0;
  let skipped = 0;

  for (const file of files) {
    const filePath = path.join(FILES_DIR, file.storage_path);

    console.log(`[${processedFiles + 1}/${files.length}] ${file.filename}`);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.log(`  WARNING: File not found at ${filePath}`);
      errors++;
      continue;
    }

    // Read file content
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      console.log(`  ERROR reading file: ${err.message}`);
      errors++;
      continue;
    }

    // Skip empty files
    if (!content.trim()) {
      console.log(`  Skipping: empty file`);
      skipped++;
      continue;
    }

    // Chunk the content
    const chunks = chunkText(content);
    console.log(`  Chunking: ${content.length} chars -> ${chunks.length} chunks`);

    // Process each chunk
    let fileChunks = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      try {
        // Get embedding
        const embedding = await getEmbedding(chunk);
        const embeddingBuffer = embeddingToBuffer(embedding);

        // Insert into database
        insertStmt.run(
          randomUUID(),
          file.id,
          i,
          chunk,
          embeddingBuffer,
          Date.now()
        );

        totalChunks++;
        fileChunks++;

        // Progress for files with many chunks
        if (chunks.length > 20 && (i + 1) % 20 === 0) {
          process.stdout.write(`  Progress: ${i + 1}/${chunks.length} chunks\r`);
        }

        // Small delay to avoid overwhelming embedding server
        await new Promise(r => setTimeout(r, 5));

      } catch (err) {
        console.log(`  ERROR on chunk ${i}: ${err.message}`);
        errors++;
      }
    }

    console.log(`  Done: ${fileChunks} chunks embedded`);
    processedFiles++;
  }

  // Final count
  const finalEmbeddingCount = db.prepare('SELECT COUNT(*) as count FROM chunk_embeddings').get().count;

  db.close();

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('BACKFILL COMPLETE');
  console.log('='.repeat(60));
  console.log(`Files processed: ${processedFiles}/${files.length}`);
  console.log(`Files skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total chunks embedded: ${totalChunks}`);
  console.log(`Embeddings before: ${initialEmbeddingCount}`);
  console.log(`Embeddings after: ${finalEmbeddingCount}`);
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('\nFATAL ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});
