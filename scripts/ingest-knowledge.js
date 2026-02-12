#!/usr/bin/env node
/**
 * TARX Knowledge Base Ingestion Script
 *
 * Ingests audit results and onboarding docs into the RAG knowledge base.
 * Replicates the tarx_upload_file + embedding pipeline from tarx-core.
 *
 * Usage: cd extensions/tarx-core && node ../../scripts/ingest-knowledge.js
 */

const Database = require('better-sqlite3');
const { randomUUID, createHash } = require('crypto');
const { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } = require('fs');
const { join, basename, extname } = require('path');
const { homedir } = require('os');

// ─── Config ───────────────────────────────────────────────────────────
const DB_DIR = join(homedir(), 'Library/Application Support/tarx');
const DB_PATH = join(DB_DIR, 'memory.db');
const FILES_DIR = join(DB_DIR, 'files');
const EMBEDDING_URL = 'http://localhost:11437/v1/embeddings';
const EMBED_MODEL = 'nomic-embed-text-v1.5';
const EMBED_DIMS = 768;
const STORED_DIMS = 1024;
const CHUNK_SIZE = 512;
const CHUNK_OVERLAP = 128;
const SPACE_ID = 'space-tarx-dev';

// ─── Files to ingest ──────────────────────────────────────────────────
const REPO_ROOT = join(homedir(), 'Desktop/tarx-code-oss');
const ONBOARDING_DIR = join(homedir(), 'Desktop/grok-onboarding');

function getFilesToIngest() {
  const files = [];

  // Audit files from repo
  const auditFiles = [
    join(REPO_ROOT, 'TOOL_AUDIT.md'),
    join(REPO_ROOT, 'TARX_CONVERSATIONAL_UI_AUDIT.md'),
    join(REPO_ROOT, 'extensions/tarx/SIDEBAR_UI_AUDIT.md'),
  ];

  for (const path of auditFiles) {
    if (existsSync(path)) {
      files.push({ path, filename: basename(path) });
    } else {
      console.warn(`  [SKIP] ${path} not found`);
    }
  }

  // Onboarding docs
  if (existsSync(ONBOARDING_DIR)) {
    const entries = readdirSync(ONBOARDING_DIR)
      .filter(f => f.endsWith('.md'))
      .sort();
    for (const entry of entries) {
      files.push({
        path: join(ONBOARDING_DIR, entry),
        filename: entry,
      });
    }
  } else {
    console.warn(`  [SKIP] ${ONBOARDING_DIR} not found`);
  }

  return files;
}

// ─── Chunking (matches tarx-core/database.ts) ────────────────────────
function chunkText(text) {
  const chunks = [];
  const lines = text.split('\n');
  let currentChunk = '';
  let chunkStart = 0;
  let currentOffset = 0;
  let chunkIndex = 0;

  for (const line of lines) {
    const lineWithNewline = line + '\n';

    if (currentChunk.length + lineWithNewline.length > CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        index: chunkIndex++,
        startOffset: chunkStart,
        endOffset: currentOffset,
      });

      const overlapStart = Math.max(0, currentChunk.length - CHUNK_OVERLAP);
      currentChunk = currentChunk.slice(overlapStart) + lineWithNewline;
      chunkStart = currentOffset - (currentChunk.length - lineWithNewline.length);
    } else {
      currentChunk += lineWithNewline;
    }

    currentOffset += lineWithNewline.length;
  }

  if (currentChunk.trim().length > 0) {
    chunks.push({
      content: currentChunk.trim(),
      index: chunkIndex,
      startOffset: chunkStart,
      endOffset: currentOffset,
    });
  }

  return chunks;
}

// ─── Embedding ────────────────────────────────────────────────────────
async function generateEmbedding(text) {
  try {
    const response = await fetch(EMBEDDING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: text,
        model: 'nomic-embed',
      }),
    });

    if (!response.ok) {
      console.error(`  Embedding API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (!data.data?.[0]?.embedding) {
      console.error('  No embedding in response');
      return null;
    }

    return new Float32Array(data.data[0].embedding);
  } catch (err) {
    console.error(`  Embedding fetch error: ${err.message}`);
    return null;
  }
}

function padEmbedding(embedding) {
  const padded = new Float32Array(STORED_DIMS);
  padded.set(embedding.slice(0, STORED_DIMS));
  return Buffer.from(padded.buffer);
}

// ─── Cosine similarity (for verification) ─────────────────────────────
function cosineSimilarity(a, b) {
  const len = Math.min(a.length, b.length);
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const mag = Math.sqrt(normA) * Math.sqrt(normB);
  return mag === 0 ? 0 : dot / mag;
}

// ─── Main ingestion ──────────────────────────────────────────────────
async function main() {
  console.log('=== TARX Knowledge Base Ingestion ===\n');

  // Ensure files directory exists
  mkdirSync(FILES_DIR, { recursive: true });

  // Open database
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Get baseline counts
  const baselineKE = db.prepare('SELECT COUNT(*) as cnt FROM knowledge_embeddings').get().cnt;
  const baselineFiles = db.prepare('SELECT COUNT(*) as cnt FROM files WHERE deleted_at IS NULL').get().cnt;
  console.log(`Baseline: ${baselineKE} knowledge_embeddings, ${baselineFiles} files\n`);

  // Ensure space exists
  const spaceExists = db.prepare('SELECT id FROM spaces WHERE id = ?').get(SPACE_ID);
  if (!spaceExists) {
    console.log(`Creating space "${SPACE_ID}"...`);
    db.prepare('INSERT INTO spaces (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
      SPACE_ID, 'TARX Development', Date.now(), Date.now()
    );
  }

  // Prepare statements
  const insertFile = db.prepare(`
    INSERT INTO files (id, filename, mime_type, size_bytes, storage_path, sha256_hash, created_at, last_accessed_at, reference_count, source_type)
    VALUES (?, ?, 'text/plain', ?, ?, ?, ?, ?, 1, 'upload')
  `);

  const insertSpaceFile = db.prepare(`
    INSERT INTO space_files (space_id, file_id, added_at)
    VALUES (?, ?, ?)
  `);

  const insertKE = db.prepare(`
    INSERT INTO knowledge_embeddings (id, space_id, source_type, source_id, title, content, embedding, model, original_dimensions, stored_dimensions, created_at, updated_at)
    VALUES (?, ?, 'file', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertCE = db.prepare(`
    INSERT INTO chunk_embeddings (id, file_id, chunk_index, content, embedding, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const updateIndexed = db.prepare('UPDATE files SET indexed_at = ? WHERE id = ?');

  const checkDup = db.prepare('SELECT id FROM files WHERE sha256_hash = ? AND deleted_at IS NULL');

  // Get files to ingest
  const filesToIngest = getFilesToIngest();
  console.log(`Found ${filesToIngest.length} files to ingest:\n`);

  let totalChunks = 0;
  let totalEmbedded = 0;
  let skippedDups = 0;
  let failedEmbeddings = 0;
  const ingestedFiles = [];

  for (const { path: filePath, filename } of filesToIngest) {
    process.stdout.write(`[${filename}] `);

    // Read content
    const content = readFileSync(filePath, 'utf8');
    const hash = createHash('sha256').update(content).digest('hex');

    // Dedup check
    const existing = checkDup.get(hash);
    if (existing) {
      console.log(`SKIP (duplicate, hash=${hash.slice(0, 12)})`);
      skippedDups++;
      continue;
    }

    // Create file record
    const fileId = randomUUID();
    const now = Date.now();
    const storagePath = `${fileId}-${filename}`;

    // Write to disk
    writeFileSync(join(FILES_DIR, storagePath), content, 'utf8');

    // Insert DB records
    insertFile.run(fileId, filename, content.length, storagePath, hash, now, now);
    insertSpaceFile.run(SPACE_ID, fileId, now);

    // Chunk and embed
    const chunks = chunkText(content);
    let embeddedCount = 0;

    for (const chunk of chunks) {
      const embedding = await generateEmbedding(`search_document: ${chunk.content}`);
      if (embedding) {
        const paddedBuf = padEmbedding(embedding);
        const chunkTitle = `${filename} [chunk ${chunk.index + 1}/${chunks.length}]`;

        // Insert into knowledge_embeddings (active search table)
        insertKE.run(
          randomUUID(), SPACE_ID, fileId, chunkTitle,
          chunk.content, paddedBuf, EMBED_MODEL,
          EMBED_DIMS, STORED_DIMS, now, now
        );

        // Insert into chunk_embeddings (legacy table)
        insertCE.run(randomUUID(), fileId, chunk.index, chunk.content, paddedBuf, now);

        embeddedCount++;
      } else {
        failedEmbeddings++;
      }
    }

    // Mark indexed
    updateIndexed.run(Date.now(), fileId);

    totalChunks += chunks.length;
    totalEmbedded += embeddedCount;
    ingestedFiles.push(filename);

    console.log(`OK (${chunks.length} chunks, ${embeddedCount} embedded, ${content.length} bytes)`);
  }

  // Final counts
  const finalKE = db.prepare('SELECT COUNT(*) as cnt FROM knowledge_embeddings').get().cnt;
  const finalFiles = db.prepare('SELECT COUNT(*) as cnt FROM files WHERE deleted_at IS NULL').get().cnt;

  console.log('\n=== Ingestion Summary ===');
  console.log(`Files ingested:    ${ingestedFiles.length}`);
  console.log(`Files skipped:     ${skippedDups} (duplicates)`);
  console.log(`Total chunks:      ${totalChunks}`);
  console.log(`Chunks embedded:   ${totalEmbedded}`);
  console.log(`Failed embeddings: ${failedEmbeddings}`);
  console.log(`knowledge_embeddings: ${baselineKE} → ${finalKE} (+${finalKE - baselineKE})`);
  console.log(`files: ${baselineFiles} → ${finalFiles} (+${finalFiles - baselineFiles})`);
  console.log(`\nIngested files: ${ingestedFiles.join(', ')}`);

  // ─── Verification: test search ─────────────────────────────────────
  console.log('\n=== Search Verification ===');
  const testQueries = ['tarx-ops tools', 'MCP tools', 'webview bundle pipeline'];

  for (const query of testQueries) {
    const queryEmb = await generateEmbedding(`search_query: ${query}`);
    if (!queryEmb) {
      console.log(`  [${query}] FAIL - could not generate query embedding`);
      continue;
    }

    const rows = db.prepare(`
      SELECT id, source_id, title, content, embedding
      FROM knowledge_embeddings
      WHERE space_id = ?
    `).all(SPACE_ID);

    const results = [];
    for (const row of rows) {
      const stored = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.length / 4);
      const sim = cosineSimilarity(queryEmb, stored);
      if (sim > 0.5) {
        results.push({ title: row.title, similarity: sim, content: row.content.slice(0, 80) });
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    const top3 = results.slice(0, 3);

    console.log(`\n  Query: "${query}" → ${results.length} results (>0.5 similarity)`);
    for (const r of top3) {
      console.log(`    [${r.similarity.toFixed(3)}] ${r.title}: ${r.content}...`);
    }
  }

  db.close();
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
