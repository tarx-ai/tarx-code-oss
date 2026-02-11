/**
 * TARX MCP Server - Database Integration
 *
 * Full database access for MCP server to control TARX app:
 * - Space management
 * - Session/Chat management
 * - Message handling
 * - File/RAG operations
 */

import Database from 'better-sqlite3';
import { homedir } from 'os';
import { join, basename, extname, relative } from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'fs';
import { randomUUID, createHash } from 'crypto';

// Database path - must match TARX app
const DB_DIR = join(homedir(), 'Library/Application Support/tarx');
const DB_PATH = join(DB_DIR, 'memory.db');
const FILES_DIR = join(DB_DIR, 'files');

// Ensure directories exist
if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
}
if (!existsSync(FILES_DIR)) {
  mkdirSync(FILES_DIR, { recursive: true });
}

// Initialize database connection
let db: Database.Database | null = null;

/**
 * Initialize database schema - creates all required tables
 */
function initializeSchema(database: Database.Database): void {
  // Spaces table (chat spaces/workspaces)
  database.exec(`
    CREATE TABLE IF NOT EXISTS spaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      emoji TEXT DEFAULT '📁',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_accessed_at INTEGER NOT NULL,
      message_count INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      deleted_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_spaces_last_accessed ON spaces(last_accessed_at);
  `);

  // Sessions table (chat sessions within a space)
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      title TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      message_count INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      model TEXT,
      deleted_at INTEGER,
      FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_space ON sessions(space_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at);
  `);

  // Messages table
  database.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      model TEXT,
      tokens INTEGER,
      latency_ms INTEGER,
      deleted_at INTEGER,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
  `);

  // Files table
  database.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      sha256_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_accessed_at INTEGER,
      reference_count INTEGER DEFAULT 1,
      deleted_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_files_hash ON files(sha256_hash);
  `);

  // Space-Files junction table
  database.exec(`
    CREATE TABLE IF NOT EXISTS space_files (
      space_id TEXT NOT NULL,
      file_id TEXT NOT NULL,
      added_at INTEGER NOT NULL,
      PRIMARY KEY (space_id, file_id),
      FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
    );
  `);

  // Knowledge embeddings table (for RAG)
  database.exec(`
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
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_space ON knowledge_embeddings(space_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_source ON knowledge_embeddings(source_type, source_id);
  `);

  // Chunk embeddings table (legacy/alternative)
  database.exec(`
    CREATE TABLE IF NOT EXISTS chunk_embeddings (
      id TEXT PRIMARY KEY,
      file_id TEXT,
      chunk_index INTEGER,
      content TEXT NOT NULL,
      embedding BLOB NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
    );
  `);

  // Training data table - for fine-tuning dataset collection
  database.exec(`
    CREATE TABLE IF NOT EXISTS training_data (
      id TEXT PRIMARY KEY,
      instruction TEXT NOT NULL,
      response TEXT NOT NULL,
      context TEXT,
      model_used TEXT,
      route TEXT CHECK(route IN ('local', 'network')),
      rag_chunks_used INTEGER DEFAULT 0,
      rag_context TEXT,
      quality_signal TEXT DEFAULT 'none' CHECK(quality_signal IN ('none', 'thumbs_up', 'thumbs_down')),
      tokens_prompt INTEGER,
      tokens_completion INTEGER,
      latency_ms INTEGER,
      session_id TEXT,
      user_message_id TEXT,
      assistant_message_id TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL,
      FOREIGN KEY (user_message_id) REFERENCES messages(id) ON DELETE SET NULL,
      FOREIGN KEY (assistant_message_id) REFERENCES messages(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_training_data_quality ON training_data(quality_signal);
    CREATE INDEX IF NOT EXISTS idx_training_data_created ON training_data(created_at);
    CREATE INDEX IF NOT EXISTS idx_training_data_model ON training_data(model_used);
  `);

  // Run ALTER TABLE to add missing columns to existing tables (safe to run multiple times)
  // Watched directories table
  database.exec(`
    CREATE TABLE IF NOT EXISTS watched_directories (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      label TEXT,
      scan_depth INTEGER DEFAULT 3,
      include_patterns TEXT DEFAULT '[]',
      exclude_patterns TEXT DEFAULT '[]',
      last_scanned_at INTEGER,
      file_count INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL
    );
  `);

  const alterStatements = [
    // Add total_tokens to sessions if missing
    `ALTER TABLE sessions ADD COLUMN total_tokens INTEGER DEFAULT 0`,
    // Add space_id to knowledge_embeddings if missing (for legacy tables)
    `ALTER TABLE knowledge_embeddings ADD COLUMN space_id TEXT`,
    // Phase 1: File organization columns
    `ALTER TABLE files ADD COLUMN source_type TEXT DEFAULT 'upload'`,
    `ALTER TABLE files ADD COLUMN original_path TEXT`,
    `ALTER TABLE files ADD COLUMN is_reference INTEGER DEFAULT 0`,
    `ALTER TABLE files ADD COLUMN last_modified INTEGER`,
    `ALTER TABLE files ADD COLUMN indexed_at INTEGER`,
  ];

  for (const stmt of alterStatements) {
    try {
      database.exec(stmt);
    } catch (e) {
      // Column likely already exists, ignore
    }
  }

  console.error('[TARX MCP] Database schema initialized');
}

export function getDatabase(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initializeSchema(db);
  }
  return db;
}

// ============================================================================
// SPACE MANAGEMENT
// ============================================================================

export interface Space {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  created_at: number;
  updated_at: number;
  last_accessed_at: number;
  message_count: number;
  total_tokens: number;
}

export function listSpaces(): Space[] {
  const database = getDatabase();
  return database.prepare(`
    SELECT id, name, description, emoji, created_at, updated_at, last_accessed_at, message_count, total_tokens
    FROM spaces
    WHERE deleted_at IS NULL
    ORDER BY last_accessed_at DESC
  `).all() as Space[];
}

export function createSpace(name: string, description?: string, emoji?: string): Space {
  const database = getDatabase();
  const now = Date.now();
  const id = randomUUID();

  database.prepare(`
    INSERT INTO spaces (id, name, description, emoji, created_at, updated_at, last_accessed_at, message_count, total_tokens)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)
  `).run(id, name, description || null, emoji || '📁', now, now, now);

  return {
    id,
    name,
    description: description || null,
    emoji: emoji || '📁',
    created_at: now,
    updated_at: now,
    last_accessed_at: now,
    message_count: 0,
    total_tokens: 0
  };
}

export function getSpace(spaceId: string): Space | null {
  const database = getDatabase();
  return database.prepare(`
    SELECT id, name, description, emoji, created_at, updated_at, last_accessed_at, message_count, total_tokens
    FROM spaces
    WHERE id = ? AND deleted_at IS NULL
  `).get(spaceId) as Space | null;
}

export function getOrCreateMCPSpace(name: string = 'MCP Testing'): Space {
  const database = getDatabase();
  let space = database.prepare('SELECT * FROM spaces WHERE name = ? AND deleted_at IS NULL').get(name) as Space | undefined;

  if (!space) {
    space = createSpace(name, 'Conversations from MCP server testing', '🔌');
  }

  return space;
}

// ============================================================================
// SESSION/CHAT MANAGEMENT
// ============================================================================

export interface Session {
  id: string;
  space_id: string;
  title: string | null;
  created_at: number;
  updated_at: number;
  message_count: number;
  total_tokens: number;
  model: string | null;
}

export function listSessions(spaceId: string): Session[] {
  const database = getDatabase();
  return database.prepare(`
    SELECT id, space_id, title, created_at, updated_at, message_count, total_tokens, model
    FROM sessions
    WHERE space_id = ? AND deleted_at IS NULL
    ORDER BY updated_at DESC
  `).all(spaceId) as Session[];
}

export function createSession(spaceId: string, title?: string): string {
  const database = getDatabase();
  const now = Date.now();
  const sessionId = randomUUID();

  database.prepare(`
    INSERT INTO sessions (id, space_id, title, created_at, updated_at, message_count, total_tokens)
    VALUES (?, ?, ?, ?, ?, 0, 0)
  `).run(sessionId, spaceId, title || `Session ${new Date().toLocaleString()}`, now, now);

  return sessionId;
}

export function getSession(sessionId: string): Session | null {
  const database = getDatabase();
  return database.prepare(`
    SELECT id, space_id, title, created_at, updated_at, message_count, total_tokens, model
    FROM sessions
    WHERE id = ? AND deleted_at IS NULL
  `).get(sessionId) as Session | null;
}

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

export interface Message {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: number;
  model: string | null;
  tokens: number | null;
  latency_ms: number | null;
}

export function addMessage(
  sessionId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  metadata?: {
    model?: string;
    tokens?: number;
    latency_ms?: number;
  }
): string {
  const database = getDatabase();
  const now = Date.now();
  const messageId = randomUUID();

  database.prepare(`
    INSERT INTO messages (id, session_id, role, content, created_at, model, tokens, latency_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    messageId,
    sessionId,
    role,
    content,
    now,
    metadata?.model || null,
    metadata?.tokens || null,
    metadata?.latency_ms || null
  );

  // Update session stats
  database.prepare(`
    UPDATE sessions
    SET message_count = message_count + 1,
        updated_at = ?,
        total_tokens = total_tokens + COALESCE(?, 0)
    WHERE id = ?
  `).run(now, metadata?.tokens || 0, sessionId);

  // Update space stats
  database.prepare(`
    UPDATE spaces
    SET message_count = message_count + 1,
        updated_at = ?,
        last_accessed_at = ?,
        total_tokens = total_tokens + COALESCE(?, 0)
    WHERE id = (SELECT space_id FROM sessions WHERE id = ?)
  `).run(now, now, metadata?.tokens || 0, sessionId);

  return messageId;
}

export function getMessages(sessionId: string, limit?: number): Message[] {
  const database = getDatabase();
  const sql = limit
    ? `SELECT * FROM messages WHERE session_id = ? AND deleted_at IS NULL ORDER BY created_at ASC LIMIT ?`
    : `SELECT * FROM messages WHERE session_id = ? AND deleted_at IS NULL ORDER BY created_at ASC`;

  return limit
    ? database.prepare(sql).all(sessionId, limit) as Message[]
    : database.prepare(sql).all(sessionId) as Message[];
}

// ============================================================================
// CURRENT SESSION TRACKING
// ============================================================================

let currentSessionId: string | null = null;
let currentSessionTimestamp: number = 0;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export function getCurrentSession(): { sessionId: string; spaceId: string; isNew: boolean } {
  const now = Date.now();
  const space = getOrCreateMCPSpace();

  if (currentSessionId && (now - currentSessionTimestamp) < SESSION_TIMEOUT_MS) {
    currentSessionTimestamp = now;
    return { sessionId: currentSessionId, spaceId: space.id, isNew: false };
  }

  const sessionId = createSession(space.id);
  currentSessionId = sessionId;
  currentSessionTimestamp = now;

  return { sessionId, spaceId: space.id, isNew: true };
}

export function storeConversationTurn(
  prompt: string,
  response: string,
  metadata?: {
    model?: string;
    promptTokens?: number;
    responseTokens?: number;
    latency_ms?: number;
  }
): { sessionId: string; userMessageId: string; assistantMessageId: string } {
  const { sessionId } = getCurrentSession();

  const userMessageId = addMessage(sessionId, 'user', prompt, {
    tokens: metadata?.promptTokens
  });

  const assistantMessageId = addMessage(sessionId, 'assistant', response, {
    model: metadata?.model || 'tarx-local',
    tokens: metadata?.responseTokens,
    latency_ms: metadata?.latency_ms
  });

  return { sessionId, userMessageId, assistantMessageId };
}

// ============================================================================
// TRAINING DATA COLLECTION
// ============================================================================

export interface TrainingDataParams {
  instruction: string;
  response: string;
  context?: string;
  modelUsed: string;
  route?: 'local' | 'network';
  ragChunksUsed?: number;
  ragContext?: string;
  tokensPrompt?: number;
  tokensCompletion?: number;
  latencyMs?: number;
  sessionId?: string;
  userMessageId?: string;
  assistantMessageId?: string;
}

/**
 * Collect training data for fine-tuning future models.
 * Call this after every successful chat completion.
 */
export function collectTrainingData(params: TrainingDataParams): string {
  const database = getDatabase();
  const trainingDataId = randomUUID();
  const now = Date.now();

  database.prepare(`
    INSERT INTO training_data (
      id, instruction, response, context, model_used, route,
      rag_chunks_used, rag_context, quality_signal,
      tokens_prompt, tokens_completion, latency_ms,
      session_id, user_message_id, assistant_message_id, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'none', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    trainingDataId,
    params.instruction,
    params.response,
    params.context || null,
    params.modelUsed,
    params.route || null,
    params.ragChunksUsed || 0,
    params.ragContext || null,
    params.tokensPrompt || null,
    params.tokensCompletion || null,
    params.latencyMs || null,
    params.sessionId || null,
    params.userMessageId || null,
    params.assistantMessageId || null,
    now
  );

  console.error(`[TARX Training] Collected training data: ${trainingDataId}`);
  return trainingDataId;
}

export interface TrainingDataRecord {
  id: string;
  instruction: string;
  response: string;
  context: string | null;
  model_used: string;
  route: string | null;
  rag_chunks_used: number;
  rag_context: string | null;
  quality_signal: string;
  tokens_prompt: number | null;
  tokens_completion: number | null;
  latency_ms: number | null;
  session_id: string | null;
  user_message_id: string | null;
  assistant_message_id: string | null;
  created_at: number;
}

/**
 * Export training data with optional filters for fine-tuning
 */
export function exportTrainingData(options?: {
  minTokens?: number;
  qualitySignal?: 'thumbs_up' | 'thumbs_down' | 'none';
  startDate?: number;
  endDate?: number;
  limit?: number;
}): TrainingDataRecord[] {
  const database = getDatabase();

  let query = `SELECT * FROM training_data WHERE 1=1`;
  const params: any[] = [];

  if (options?.minTokens) {
    query += ` AND (tokens_prompt + COALESCE(tokens_completion, 0)) >= ?`;
    params.push(options.minTokens);
  }

  if (options?.qualitySignal) {
    query += ` AND quality_signal = ?`;
    params.push(options.qualitySignal);
  }

  if (options?.startDate) {
    query += ` AND created_at >= ?`;
    params.push(options.startDate);
  }

  if (options?.endDate) {
    query += ` AND created_at <= ?`;
    params.push(options.endDate);
  }

  query += ` ORDER BY created_at DESC`;

  if (options?.limit) {
    query += ` LIMIT ?`;
    params.push(options.limit);
  }

  return database.prepare(query).all(...params) as TrainingDataRecord[];
}

/**
 * Rate a response for training data quality
 */
export function rateTrainingResponse(
  messageId: string,
  rating: 'thumbs_up' | 'thumbs_down' | 'none'
): boolean {
  const database = getDatabase();

  const result = database.prepare(`
    UPDATE training_data
    SET quality_signal = ?
    WHERE assistant_message_id = ?
  `).run(rating, messageId);

  if (result.changes > 0) {
    console.error(`[TARX Training] Rated message ${messageId} as ${rating}`);
    return true;
  }

  return false;
}

/**
 * Get training data statistics
 */
export function getTrainingDataStats(): {
  totalRecords: number;
  thumbsUp: number;
  thumbsDown: number;
  avgTokens: number;
  modelBreakdown: Record<string, number>;
} {
  const database = getDatabase();

  const stats = database.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN quality_signal = 'thumbs_up' THEN 1 ELSE 0 END) as thumbs_up,
      SUM(CASE WHEN quality_signal = 'thumbs_down' THEN 1 ELSE 0 END) as thumbs_down,
      AVG(COALESCE(tokens_prompt, 0) + COALESCE(tokens_completion, 0)) as avg_tokens
    FROM training_data
  `).get() as any;

  const modelBreakdown = database.prepare(`
    SELECT model_used, COUNT(*) as count
    FROM training_data
    WHERE model_used IS NOT NULL
    GROUP BY model_used
  `).all() as Array<{ model_used: string; count: number }>;

  const breakdown: Record<string, number> = {};
  for (const row of modelBreakdown) {
    breakdown[row.model_used] = row.count;
  }

  return {
    totalRecords: stats.total || 0,
    thumbsUp: stats.thumbs_up || 0,
    thumbsDown: stats.thumbs_down || 0,
    avgTokens: Math.round(stats.avg_tokens || 0),
    modelBreakdown: breakdown
  };
}

// ============================================================================
// FILE MANAGEMENT
// ============================================================================

export interface FileRecord {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  sha256_hash: string;
  created_at: number;
  source_type?: string;
  original_path?: string;
  is_reference?: number;
  last_modified?: number;
  indexed_at?: number;
}

export interface WatchedDirectory {
  id: string;
  path: string;
  label: string | null;
  scan_depth: number;
  include_patterns: string;
  exclude_patterns: string;
  last_scanned_at: number | null;
  file_count: number;
  enabled: number;
  created_at: number;
}

export function listFiles(spaceId?: string): FileRecord[] {
  const database = getDatabase();

  if (spaceId) {
    return database.prepare(`
      SELECT f.id, f.filename, f.mime_type, f.size_bytes, f.storage_path, f.sha256_hash, f.created_at
      FROM files f
      JOIN space_files sf ON f.id = sf.file_id
      WHERE sf.space_id = ? AND f.deleted_at IS NULL
      ORDER BY f.created_at DESC
    `).all(spaceId) as FileRecord[];
  }

  return database.prepare(`
    SELECT id, filename, mime_type, size_bytes, storage_path, sha256_hash, created_at
    FROM files
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC
  `).all() as FileRecord[];
}

export function uploadFile(
  spaceId: string,
  filename: string,
  content: string,
  mimeType: string = 'text/plain'
): FileRecord {
  const database = getDatabase();
  const now = Date.now();
  const fileId = randomUUID();

  // Calculate hash
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(content).digest('hex');

  // Save file to disk
  const storagePath = `${fileId}-${filename}`;
  const fullPath = join(FILES_DIR, storagePath);
  writeFileSync(fullPath, content, 'utf8');

  // Insert file record
  database.prepare(`
    INSERT INTO files (id, filename, mime_type, size_bytes, storage_path, sha256_hash, created_at, last_accessed_at, reference_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(fileId, filename, mimeType, content.length, storagePath, hash, now, now);

  // Link to space
  database.prepare(`
    INSERT INTO space_files (space_id, file_id, added_at)
    VALUES (?, ?, ?)
  `).run(spaceId, fileId, now);

  // Fire and forget — embed chunks for RAG (don't block upload)
  embedFileToChunkEmbeddings(fileId, content, filename).catch(err =>
    console.error('[TARX] Embed failed for', filename, err)
  );

  return {
    id: fileId,
    filename,
    mime_type: mimeType,
    size_bytes: content.length,
    storage_path: storagePath,
    sha256_hash: hash,
    created_at: now
  };
}

/**
 * Embed file content into chunk_embeddings table (fire-and-forget after upload)
 */
async function embedFileToChunkEmbeddings(fileId: string, content: string, filename: string): Promise<void> {
  try {
    // Check embedding server health
    const health = await fetch(`${EMBEDDING_SERVER_URL}/health`);
    if (!health.ok) {
      console.error('[TARX] Embedding server unavailable, skipping embed for', filename);
      return;
    }

    const chunks = chunkText(content);
    if (chunks.length === 0) return;

    const database = getDatabase();
    const now = Date.now();

    // Clear any existing embeddings for this file (both tables)
    database.prepare('DELETE FROM chunk_embeddings WHERE file_id = ?').run(fileId);
    try { database.prepare("DELETE FROM knowledge_embeddings WHERE source_type = 'file' AND source_id = ?").run(fileId); } catch {}

    const insertChunk = database.prepare(
      'INSERT INTO chunk_embeddings (id, file_id, chunk_index, content, embedding, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const insertKnowledge = database.prepare(
      `INSERT OR REPLACE INTO knowledge_embeddings
       (id, space_id, source_type, source_id, title, content, embedding,
        model, original_dimensions, stored_dimensions, created_at, updated_at)
       VALUES (?, '', 'file', ?, ?, ?, ?, 'nomic-embed-text-v1.5', 768, 768, ?, ?)`
    );

    let embedded = 0;
    for (const chunk of chunks) {
      const embedding = await generateEmbedding(`search_document: ${chunk.content}`);
      if (embedding) {
        const buffer = Buffer.from(embedding.buffer);
        const chunkId = randomUUID();
        insertChunk.run(chunkId, fileId, chunk.index, chunk.content, buffer, now);
        // Also write to knowledge_embeddings (the table that search actually queries)
        const title = `${filename} [chunk ${chunk.index + 1}/${chunks.length}]`;
        insertKnowledge.run(`ke_${chunkId}`, fileId, title, chunk.content, buffer, now, now);
        embedded++;
      }
    }

    // Mark file as indexed
    if (embedded > 0) {
      try { database.prepare('UPDATE files SET indexed_at = ? WHERE id = ?').run(Date.now(), fileId); } catch {}
    }

    console.error(`[TARX] Embedded ${filename}: ${embedded}/${chunks.length} chunks → chunk_embeddings + knowledge_embeddings`);
  } catch (e) {
    console.error('[TARX] Embed failed for', filename, e);
  }
}

export function getFileContent(fileId: string): string | null {
  const database = getDatabase();
  const file = database.prepare('SELECT storage_path FROM files WHERE id = ?').get(fileId) as { storage_path: string } | undefined;

  if (!file) return null;

  const fullPath = join(FILES_DIR, file.storage_path);
  if (!existsSync(fullPath)) return null;

  return readFileSync(fullPath, 'utf8');
}

// ============================================================================
// RAG EMBEDDING FUNCTIONS
// ============================================================================

const EMBEDDING_SERVER_URL = 'http://localhost:11437';
const CHUNK_SIZE = 512;  // characters per chunk
const CHUNK_OVERLAP = 128;  // overlap between chunks

interface TextChunk {
  content: string;
  index: number;
  startOffset: number;
  endOffset: number;
}

/**
 * Chunk text into smaller pieces for embedding
 */
function chunkText(text: string, chunkSize: number = CHUNK_SIZE, overlap: number = CHUNK_OVERLAP): TextChunk[] {
  const chunks: TextChunk[] = [];
  const lines = text.split('\n');
  let currentChunk = '';
  let chunkStart = 0;
  let currentOffset = 0;
  let chunkIndex = 0;

  for (const line of lines) {
    const lineWithNewline = line + '\n';

    if (currentChunk.length + lineWithNewline.length > chunkSize && currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        index: chunkIndex++,
        startOffset: chunkStart,
        endOffset: currentOffset
      });

      const overlapStart = Math.max(0, currentChunk.length - overlap);
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
      endOffset: currentOffset
    });
  }

  return chunks;
}

/**
 * Generate embedding for text using the embedding server
 */
async function generateEmbedding(text: string): Promise<Float32Array | null> {
  try {
    const response = await fetch(`${EMBEDDING_SERVER_URL}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: text,
        model: 'nomic-embed'
      })
    });

    if (!response.ok) {
      console.error(`[TARX MCP] Embedding failed: ${response.status}`);
      return null;
    }

    const data = await response.json() as { data: Array<{ embedding: number[] }> };
    if (!data.data?.[0]?.embedding) {
      return null;
    }

    return new Float32Array(data.data[0].embedding);
  } catch (error) {
    console.error('[TARX MCP] Embedding error:', error);
    return null;
  }
}

/**
 * Zero-pad embedding to 1024 dimensions (for uniformity with BGE-M3)
 */
function padEmbedding(embedding: Float32Array, targetDim: number = 1024): Buffer {
  const padded = new Float32Array(targetDim);
  padded.set(embedding.slice(0, targetDim));
  return Buffer.from(padded.buffer);
}

/**
 * Generate and store embeddings for a file
 * Returns the number of chunks created
 */
export async function generateFileEmbeddings(
  spaceId: string,
  fileId: string,
  filename: string,
  content: string
): Promise<{ success: boolean; chunks: number; error?: string }> {
  const database = getDatabase();
  const now = Date.now();

  try {
    // Delete existing embeddings for this file
    database.prepare(`
      DELETE FROM knowledge_embeddings
      WHERE source_type = 'file' AND source_id = ?
    `).run(fileId);

    // Chunk the content
    const chunks = chunkText(content);
    console.error(`[TARX MCP] Chunking file "${filename}": ${chunks.length} chunks`);

    if (chunks.length === 0) {
      return { success: true, chunks: 0 };
    }

    // Generate embeddings for each chunk
    let embeddedCount = 0;
    const insertStmt = database.prepare(`
      INSERT INTO knowledge_embeddings (id, space_id, source_type, source_id, title, content, embedding, model, original_dimensions, stored_dimensions, created_at, updated_at)
      VALUES (?, ?, 'file', ?, ?, ?, ?, 'nomic-embed-text-v1.5', 768, 1024, ?, ?)
    `);

    for (const chunk of chunks) {
      const embedding = await generateEmbedding(`search_document: ${chunk.content}`);
      if (embedding) {
        const embeddingBlob = padEmbedding(embedding);
        const chunkId = randomUUID();
        const title = `${filename} [chunk ${chunk.index + 1}/${chunks.length}]`;

        insertStmt.run(
          chunkId,
          spaceId,
          fileId,
          title,
          chunk.content,
          embeddingBlob,
          now,
          now
        );
        embeddedCount++;
      }
    }

    console.error(`[TARX MCP] Generated ${embeddedCount}/${chunks.length} embeddings for "${filename}"`);
    return { success: true, chunks: embeddedCount };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[TARX MCP] Failed to generate embeddings for "${filename}":`, errorMsg);
    return { success: false, chunks: 0, error: errorMsg };
  }
}

/**
 * Search knowledge embeddings by query
 * Returns top matching chunks with similarity scores
 */
export async function searchKnowledgeEmbeddings(
  spaceId: string,
  query: string,
  limit: number = 5
): Promise<Array<{ content: string; title: string; similarity: number; sourceId: string | null }>> {
  const database = getDatabase();

  // Generate query embedding (Nomic models require search_query: prefix)
  const queryEmbedding = await generateEmbedding(`search_query: ${query}`);
  if (!queryEmbedding) {
    return [];
  }

  // Get all embeddings for this space
  const embeddings = database.prepare(`
    SELECT id, source_id, title, content, embedding
    FROM knowledge_embeddings
    WHERE space_id = ?
  `).all(spaceId) as Array<{
    id: string;
    source_id: string | null;
    title: string;
    content: string;
    embedding: Buffer;
  }>;

  // Calculate cosine similarity for each
  const results: Array<{ content: string; title: string; similarity: number; sourceId: string | null }> = [];

  for (const row of embeddings) {
    const storedEmbedding = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.length / 4);
    const similarity = cosineSimilarity(queryEmbedding, storedEmbedding);

    results.push({
      content: row.content,
      title: row.title,
      similarity,
      sourceId: row.source_id
    });
  }

  // Sort by similarity and return top results
  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < len; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Get knowledge embedding count for a space
 */
export function getKnowledgeEmbeddingCount(spaceId: string): number {
  const database = getDatabase();
  return database.prepare('SELECT COUNT(*) FROM knowledge_embeddings WHERE space_id = ?').pluck().get(spaceId) as number;
}

// ============================================================================
// DATABASE STATS
// ============================================================================

export function getDatabaseStats(): {
  spaces: number;
  sessions: number;
  messages: number;
  files: number;
  chunk_embeddings: number;
  mcpSpace: Space | null;
} {
  const database = getDatabase();

  const spaces = database.prepare('SELECT COUNT(*) FROM spaces WHERE deleted_at IS NULL').pluck().get() as number;
  const sessions = database.prepare('SELECT COUNT(*) FROM sessions WHERE deleted_at IS NULL').pluck().get() as number;
  const messages = database.prepare('SELECT COUNT(*) FROM messages WHERE deleted_at IS NULL').pluck().get() as number;
  const files = database.prepare('SELECT COUNT(*) FROM files WHERE deleted_at IS NULL').pluck().get() as number;

  let chunk_embeddings = 0;
  try {
    chunk_embeddings = database.prepare('SELECT COUNT(*) FROM chunk_embeddings').pluck().get() as number;
  } catch {}

  const mcpSpace = database.prepare(`
    SELECT id, name, description, emoji, created_at, updated_at, last_accessed_at, message_count, total_tokens
    FROM spaces
    WHERE name = 'MCP Testing' AND deleted_at IS NULL
  `).get() as Space | undefined;

  return {
    spaces,
    sessions,
    messages,
    files,
    chunk_embeddings,
    mcpSpace: mcpSpace || null
  };
}

// ============================================================================
// FILE ORGANIZATION — Phase 1
// ============================================================================

const SCAN_IGNORED_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', '__pycache__', '.DS_Store',
  '.build', '.next', '.nuxt', 'dist', 'build', 'out', '.cache',
  '.vscode', '.idea', 'coverage', '.nyc_output', '.turbo',
  'vendor', 'bower_components', '.yarn', '.pnp',
]);

const SCAN_TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.rst', '.json', '.yaml', '.yml', '.toml',
  '.xml', '.html', '.htm', '.css', '.scss', '.less', '.svg',
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift', '.c', '.cpp', '.h',
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
  '.sql', '.graphql', '.gql', '.proto',
  '.env', '.gitignore', '.dockerignore', '.editorconfig',
  '.csv', '.tsv', '.log', '.conf', '.cfg', '.ini',
]);

const MAX_SCAN_FILE_SIZE = 1024 * 1024; // 1MB — skip larger files for embedding

function getMimeType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json',
    '.yaml': 'text/yaml', '.yml': 'text/yaml', '.xml': 'text/xml',
    '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml',
    '.js': 'text/javascript', '.ts': 'text/typescript', '.jsx': 'text/javascript',
    '.tsx': 'text/typescript', '.py': 'text/x-python', '.rb': 'text/x-ruby',
    '.go': 'text/x-go', '.rs': 'text/x-rust', '.java': 'text/x-java',
    '.sh': 'text/x-shellscript', '.sql': 'text/x-sql',
    '.csv': 'text/csv', '.log': 'text/plain',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

function isTextFile(filename: string): boolean {
  return SCAN_TEXT_EXTENSIONS.has(extname(filename).toLowerCase());
}

/**
 * Soft-delete a file and remove its embeddings
 */
export function deleteFile(fileId: string): boolean {
  const database = getDatabase();
  const now = Date.now();

  const file = database.prepare('SELECT id, is_reference, storage_path FROM files WHERE id = ? AND deleted_at IS NULL').get(fileId) as { id: string; is_reference: number; storage_path: string } | undefined;
  if (!file) return false;

  // Soft-delete the file record
  database.prepare('UPDATE files SET deleted_at = ? WHERE id = ?').run(now, fileId);

  // Remove embeddings
  try {
    database.prepare('DELETE FROM chunk_embeddings WHERE file_id = ?').run(fileId);
  } catch {}
  try {
    database.prepare('DELETE FROM knowledge_embeddings WHERE source_id = ?').run(fileId);
  } catch {}

  // Remove space-file links
  try {
    database.prepare('DELETE FROM space_files WHERE file_id = ?').run(fileId);
  } catch {}

  // For non-reference files, optionally remove from disk
  if (!file.is_reference && file.storage_path) {
    const fullPath = join(FILES_DIR, file.storage_path);
    try {
      if (existsSync(fullPath)) {
        const { unlinkSync } = require('fs');
        unlinkSync(fullPath);
      }
    } catch {}
  }

  console.error(`[TARX] Deleted file ${fileId}`);
  return true;
}

/**
 * Recursively scan a directory and index files as references
 */
export async function scanDirectory(
  dirPath: string,
  depth: number = 3,
  _includePatterns: string[] = [],
  _excludePatterns: string[] = []
): Promise<{ filesFound: number; filesIndexed: number; filesEmbedded: number }> {
  const database = getDatabase();
  const now = Date.now();
  let filesFound = 0;
  let filesIndexed = 0;
  let filesEmbedded = 0;

  function walkDir(currentPath: string, currentDepth: number): void {
    if (currentDepth > depth) return;

    let entries: string[];
    try {
      entries = readdirSync(currentPath);
    } catch {
      return; // Permission denied or not accessible
    }

    for (const entry of entries) {
      if (entry.startsWith('.') && SCAN_IGNORED_DIRS.has(entry)) continue;
      if (SCAN_IGNORED_DIRS.has(entry)) continue;

      const fullPath = join(currentPath, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        walkDir(fullPath, currentDepth + 1);
        continue;
      }

      if (!stat.isFile()) continue;
      filesFound++;

      // Skip files over 1MB for embedding (still index metadata)
      const filename = basename(fullPath);
      const mimeType = getMimeType(filename);
      const sizeBytes = stat.size;
      const lastModified = stat.mtimeMs;

      // Check if already indexed (by original_path)
      const existing = database.prepare(
        'SELECT id, last_modified FROM files WHERE original_path = ? AND deleted_at IS NULL'
      ).get(fullPath) as { id: string; last_modified: number } | undefined;

      if (existing) {
        // Already indexed — check if modified
        if (existing.last_modified && Math.abs(existing.last_modified - lastModified) < 1000) {
          continue; // No change
        }
        // File changed — soft-delete old record, will re-index below
        database.prepare('UPDATE files SET deleted_at = ? WHERE id = ?').run(now, existing.id);
        try { database.prepare('DELETE FROM chunk_embeddings WHERE file_id = ?').run(existing.id); } catch {}
      }

      // Compute hash for text files we can read
      let hash = '';
      let content = '';
      if (isTextFile(filename) && sizeBytes <= MAX_SCAN_FILE_SIZE) {
        try {
          content = readFileSync(fullPath, 'utf8');
          hash = createHash('sha256').update(content).digest('hex');
        } catch {
          content = '';
          hash = '';
        }
      }

      if (!hash) {
        // For binary or large files, hash from metadata
        hash = createHash('sha256').update(`${fullPath}:${sizeBytes}:${lastModified}`).digest('hex');
      }

      // Check hash dedup
      const dupCheck = database.prepare(
        'SELECT id FROM files WHERE sha256_hash = ? AND deleted_at IS NULL'
      ).get(hash) as { id: string } | undefined;

      if (dupCheck) continue; // Duplicate content

      const fileId = randomUUID();
      const storagePath = `ref:${fullPath}`; // Reference — no copy

      database.prepare(`
        INSERT INTO files (id, filename, mime_type, size_bytes, storage_path, sha256_hash,
          created_at, last_accessed_at, reference_count, source_type, original_path, is_reference, last_modified)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'scan', ?, 1, ?)
      `).run(fileId, filename, mimeType, sizeBytes, storagePath, hash, now, now, fullPath, lastModified);
      filesIndexed++;

      // Queue for embedding (text files only, under size limit)
      if (content && content.trim().length > 0) {
        embedFileToChunkEmbeddings(fileId, content, filename).then(() => {
          database.prepare('UPDATE files SET indexed_at = ? WHERE id = ?').run(Date.now(), fileId);
        }).catch(() => {});
        filesEmbedded++;
      }
    }
  }

  walkDir(dirPath, 0);

  console.error(`[TARX] Scanned ${dirPath}: found=${filesFound}, indexed=${filesIndexed}, embedded=${filesEmbedded}`);
  return { filesFound, filesIndexed, filesEmbedded };
}

/**
 * Add a directory to the watch list
 */
export function addWatch(
  dirPath: string,
  label?: string,
  depth: number = 3,
  includePatterns: string[] = [],
  excludePatterns: string[] = []
): WatchedDirectory {
  const database = getDatabase();
  const now = Date.now();
  const id = randomUUID();

  database.prepare(`
    INSERT INTO watched_directories (id, path, label, scan_depth, include_patterns, exclude_patterns, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, dirPath, label || basename(dirPath), depth, JSON.stringify(includePatterns), JSON.stringify(excludePatterns), now);

  return database.prepare('SELECT * FROM watched_directories WHERE id = ?').get(id) as WatchedDirectory;
}

/**
 * Remove a watched directory and soft-delete its scanned files
 */
export function removeWatch(watchId: string): boolean {
  const database = getDatabase();
  const watch = database.prepare('SELECT path FROM watched_directories WHERE id = ?').get(watchId) as { path: string } | undefined;
  if (!watch) return false;

  // Soft-delete files scanned from this directory
  const now = Date.now();
  database.prepare(`
    UPDATE files SET deleted_at = ?
    WHERE original_path LIKE ? AND source_type = 'scan' AND deleted_at IS NULL
  `).run(now, watch.path + '%');

  // Remove the watch
  database.prepare('DELETE FROM watched_directories WHERE id = ?').run(watchId);

  console.error(`[TARX] Removed watch ${watchId} (${watch.path})`);
  return true;
}

/**
 * List all watched directories
 */
export function listWatches(): WatchedDirectory[] {
  const database = getDatabase();
  return database.prepare('SELECT * FROM watched_directories ORDER BY created_at DESC').all() as WatchedDirectory[];
}

/**
 * Rescan one or all watched directories
 */
export async function rescan(watchId?: string): Promise<{ newFiles: number; updatedFiles: number; deletedFiles: number }> {
  const database = getDatabase();
  let watches: WatchedDirectory[];

  if (watchId) {
    const w = database.prepare('SELECT * FROM watched_directories WHERE id = ? AND enabled = 1').get(watchId) as WatchedDirectory | undefined;
    watches = w ? [w] : [];
  } else {
    watches = database.prepare('SELECT * FROM watched_directories WHERE enabled = 1').all() as WatchedDirectory[];
  }

  let totalNew = 0;
  let totalUpdated = 0;
  let totalDeleted = 0;

  for (const watch of watches) {
    const includes = JSON.parse(watch.include_patterns || '[]') as string[];
    const excludes = JSON.parse(watch.exclude_patterns || '[]') as string[];

    const result = await scanDirectory(watch.path, watch.scan_depth, includes, excludes);

    // Detect deleted files (files in DB but no longer on disk)
    const scannedFiles = database.prepare(
      "SELECT id, original_path FROM files WHERE original_path LIKE ? AND source_type = 'scan' AND deleted_at IS NULL"
    ).all(watch.path + '%') as Array<{ id: string; original_path: string }>;

    let deleted = 0;
    for (const f of scannedFiles) {
      if (!existsSync(f.original_path)) {
        database.prepare('UPDATE files SET deleted_at = ? WHERE id = ?').run(Date.now(), f.id);
        deleted++;
      }
    }

    totalNew += result.filesIndexed;
    totalDeleted += deleted;

    // Update watch metadata
    const fileCount = database.prepare(
      "SELECT COUNT(*) FROM files WHERE original_path LIKE ? AND source_type = 'scan' AND deleted_at IS NULL"
    ).pluck().get(watch.path + '%') as number;

    database.prepare(
      'UPDATE watched_directories SET last_scanned_at = ?, file_count = ? WHERE id = ?'
    ).run(Date.now(), fileCount, watch.id);
  }

  return { newFiles: totalNew, updatedFiles: totalUpdated, deletedFiles: totalDeleted };
}

/**
 * Get files grouped by source_type for sidebar display
 */
export function getFilesGrouped(): { uploaded: FileRecord[]; scanned: FileRecord[] } {
  const database = getDatabase();

  const uploaded = database.prepare(`
    SELECT id, filename, mime_type, size_bytes, storage_path, sha256_hash, created_at,
           source_type, original_path, is_reference, last_modified, indexed_at
    FROM files
    WHERE deleted_at IS NULL AND (source_type = 'upload' OR source_type IS NULL)
    ORDER BY created_at DESC
  `).all() as FileRecord[];

  const scanned = database.prepare(`
    SELECT id, filename, mime_type, size_bytes, storage_path, sha256_hash, created_at,
           source_type, original_path, is_reference, last_modified, indexed_at
    FROM files
    WHERE deleted_at IS NULL AND source_type = 'scan'
    ORDER BY original_path ASC
  `).all() as FileRecord[];

  return { uploaded, scanned };
}

/**
 * Get file content — reads from disk for both uploaded and reference files
 */
export function getFileContentById(fileId: string): string | null {
  const database = getDatabase();
  const file = database.prepare(
    'SELECT storage_path, original_path, is_reference FROM files WHERE id = ? AND deleted_at IS NULL'
  ).get(fileId) as { storage_path: string; original_path: string | null; is_reference: number } | undefined;

  if (!file) return null;

  try {
    if (file.is_reference && file.original_path) {
      return readFileSync(file.original_path, 'utf8');
    } else {
      return readFileSync(join(FILES_DIR, file.storage_path), 'utf8');
    }
  } catch {
    return null;
  }
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export default {
  getDatabase,
  listSpaces,
  createSpace,
  getSpace,
  getOrCreateMCPSpace,
  listSessions,
  createSession,
  getSession,
  addMessage,
  getMessages,
  getCurrentSession,
  storeConversationTurn,
  listFiles,
  uploadFile,
  getFileContent,
  getDatabaseStats,
  closeDatabase,
  // RAG functions
  generateFileEmbeddings,
  searchKnowledgeEmbeddings,
  getKnowledgeEmbeddingCount,
  // Training data functions
  collectTrainingData,
  exportTrainingData,
  rateTrainingResponse,
  getTrainingDataStats,
  // File organization (Phase 1)
  deleteFile,
  scanDirectory,
  addWatch,
  removeWatch,
  listWatches,
  rescan,
  getFilesGrouped,
  getFileContentById
};
