#!/usr/bin/env node
/**
 * Bulk re-embed all files in TARX database
 *
 * Reads ALL rows from files table, chunks each file (512 chars, 128 overlap),
 * POSTs each chunk to localhost:11437/v1/embeddings, inserts into chunk_embeddings.
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const https = require('http');

// Configuration
const DB_PATH = path.join(process.env.HOME, 'Library/Application Support/tarx/memory.db');
const FILES_DIR = path.join(process.env.HOME, 'Library/Application Support/tarx/files');
const EMBEDDING_URL = 'http://localhost:11437/v1/embeddings';
const CHUNK_SIZE = 512;
const CHUNK_OVERLAP = 128;
const MODEL = 'nomic-embed-text';

// Generate UUID
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Chunk text with overlap
function chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;

    // Avoid creating tiny final chunks
    if (text.length - start < overlap) {
      break;
    }
  }

  return chunks;
}

// Call embedding API
async function getEmbedding(text) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      input: `search_document: ${text}`,
      model: MODEL
    });

    const url = new URL(EMBEDDING_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (result.data && result.data[0] && result.data[0].embedding) {
            resolve(result.data[0].embedding);
          } else {
            reject(new Error(`Invalid response: ${body.slice(0, 200)}`));
          }
        } catch (e) {
          reject(new Error(`Parse error: ${e.message} - ${body.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Convert embedding array to binary blob for SQLite
function embeddingToBlob(embedding) {
  const buffer = Buffer.alloc(embedding.length * 4);
  for (let i = 0; i < embedding.length; i++) {
    buffer.writeFloatLE(embedding[i], i * 4);
  }
  return buffer;
}

async function main() {
  console.log('=== TARX Bulk Re-Embedding Script ===\n');

  // Open database
  console.log(`Opening database: ${DB_PATH}`);
  const db = new Database(DB_PATH);

  // Get all files
  const files = db.prepare('SELECT id, filename, storage_path, size_bytes FROM files WHERE deleted_at IS NULL').all();
  console.log(`Found ${files.length} files to process\n`);

  // Check current embedding count
  const beforeCount = db.prepare('SELECT COUNT(*) as count FROM chunk_embeddings').get().count;
  console.log(`Current chunk_embeddings count: ${beforeCount}\n`);

  // Prepare insert statement
  const insertStmt = db.prepare(`
    INSERT INTO chunk_embeddings (id, file_id, chunk_index, content, embedding, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let totalChunks = 0;
  let totalErrors = 0;

  for (const file of files) {
    const filePath = path.join(FILES_DIR, file.storage_path);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.log(`[SKIP] ${file.filename} - file not found at ${filePath}`);
      continue;
    }

    // Read file content
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (e) {
      console.log(`[ERROR] ${file.filename} - could not read: ${e.message}`);
      totalErrors++;
      continue;
    }

    // Chunk the content
    const chunks = chunkText(content);
    console.log(`[PROCESSING] ${file.filename} (${file.size_bytes} bytes) -> ${chunks.length} chunks`);

    // Process each chunk
    for (let i = 0; i < chunks.length; i++) {
      try {
        const embedding = await getEmbedding(chunks[i]);
        const blob = embeddingToBlob(embedding);

        insertStmt.run(
          generateId(),
          file.id,
          i,
          chunks[i],
          blob,
          Date.now()
        );

        totalChunks++;
        process.stdout.write(`  Chunk ${i + 1}/${chunks.length} embedded\r`);
      } catch (e) {
        console.log(`  [ERROR] Chunk ${i}: ${e.message}`);
        totalErrors++;
      }
    }

    console.log(`  ✓ Completed ${chunks.length} chunks for ${file.filename}`);
  }

  // Final count
  const afterCount = db.prepare('SELECT COUNT(*) as count FROM chunk_embeddings').get().count;

  console.log('\n=== Summary ===');
  console.log(`Files processed: ${files.length}`);
  console.log(`Chunks embedded: ${totalChunks}`);
  console.log(`Errors: ${totalErrors}`);
  console.log(`chunk_embeddings before: ${beforeCount}`);
  console.log(`chunk_embeddings after: ${afterCount}`);

  db.close();
  console.log('\nDone!');
}

main().catch(console.error);
