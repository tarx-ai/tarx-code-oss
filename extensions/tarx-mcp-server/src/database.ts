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
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { randomUUID } from 'crypto';

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

  // Run ALTER TABLE to add missing columns to existing tables (safe to run multiple times)
  const alterStatements = [
    // Add total_tokens to sessions if missing
    `ALTER TABLE sessions ADD COLUMN total_tokens INTEGER DEFAULT 0`,
    // Add space_id to knowledge_embeddings if missing (for legacy tables)
    `ALTER TABLE knowledge_embeddings ADD COLUMN space_id TEXT`,
  ];

  for (const stmt of alterStatements) {
    try {
      database.exec(stmt);
    } catch (e) {
      // Column likely already exists, ignore
    }
  }

  console.log('[TARX MCP] Database schema initialized');
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
        model: 'nomic-embed-text-v1.5'
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
    console.log(`[TARX MCP] Chunking file "${filename}": ${chunks.length} chunks`);

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
      const embedding = await generateEmbedding(chunk.content);
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

    console.log(`[TARX MCP] Generated ${embeddedCount}/${chunks.length} embeddings for "${filename}"`);
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

  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query);
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
  getKnowledgeEmbeddingCount
};
