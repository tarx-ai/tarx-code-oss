/**
 * TARX Core - Memory Database Layer
 *
 * Merged from tarx-claude-memory. Provides persistent local memory
 * with semantic search, threaded into TARX chat history.
 *
 * Uses the same shared DB at ~/Library/Application Support/tarx/memory.db
 */

import Database from 'better-sqlite3';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';

// Database path - shared with TARX app and tarx-core database.ts
const DB_DIR = join(homedir(), 'Library/Application Support/tarx');
const DB_PATH = join(DB_DIR, 'memory.db');

// Ensure directory exists
if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
}

let db: Database.Database | null = null;

export function getMemoryDatabase(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initMemorySchema();
  }
  return db;
}

function initMemorySchema(): void {
  const database = getMemoryDatabase();

  // Memory table for semantic storage
  database.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      embedding BLOB,
      source TEXT DEFAULT 'claude',
      source_id TEXT,
      importance REAL DEFAULT 0.5,
      access_count INTEGER DEFAULT 0,
      last_accessed_at INTEGER,
      created_at INTEGER NOT NULL,
      deleted_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);
  `);

  // Migrate: ensure deleted_at exists (older schemas may lack it)
  const columns = database.pragma('table_info(memories)') as Array<{ name: string }>;
  const colNames = new Set(columns.map(c => c.name));

  if (!colNames.has('deleted_at')) {
    database.exec('ALTER TABLE memories ADD COLUMN deleted_at INTEGER;');
  }

  // Migrate: add structured observation columns (claude-mem inspired)
  if (!colNames.has('title')) {
    database.exec(`
      ALTER TABLE memories ADD COLUMN title TEXT;
      ALTER TABLE memories ADD COLUMN observation_type TEXT;
      ALTER TABLE memories ADD COLUMN narrative TEXT;
      ALTER TABLE memories ADD COLUMN facts TEXT;
      ALTER TABLE memories ADD COLUMN concepts TEXT;
      ALTER TABLE memories ADD COLUMN files_read TEXT;
      ALTER TABLE memories ADD COLUMN files_modified TEXT;
    `);
  }
}

// ============================================================================
// MEMORY STORAGE
// ============================================================================

export interface Memory {
  id: string;
  content: string;
  source: string;
  importance: number;
  access_count: number;
  created_at: number;
}

export function storeMemory(
  content: string,
  options?: { importance?: number; sourceId?: string }
): Memory {
  const database = getMemoryDatabase();
  const now = Date.now();
  const id = randomUUID();

  database.prepare(`
    INSERT INTO memories (id, content, source, source_id, importance, access_count, last_accessed_at, created_at)
    VALUES (?, ?, 'claude', ?, ?, 0, ?, ?)
  `).run(id, content, options?.sourceId || null, options?.importance || 0.5, now, now);

  return {
    id,
    content,
    source: 'claude',
    importance: options?.importance || 0.5,
    access_count: 0,
    created_at: now
  };
}

// ============================================================================
// STRUCTURED OBSERVATIONS (claude-mem inspired)
// ============================================================================

export interface Observation extends Memory {
  title: string | null;
  observation_type: string | null;
  narrative: string | null;
  facts: string[];
  concepts: string[];
  files_read: string[];
  files_modified: string[];
}

export function storeObservation(args: {
  title: string;
  observationType: 'bugfix' | 'feature' | 'decision' | 'discovery' | 'change' | 'pattern' | 'context';
  narrative: string;
  facts?: string[];
  concepts?: string[];
  filesRead?: string[];
  filesModified?: string[];
  importance?: number;
}): Observation {
  const database = getMemoryDatabase();
  const now = Date.now();
  const id = randomUUID();

  // Build content from structured fields for backward-compatible text search
  const contentParts = [`[${args.observationType}] ${args.title}`, args.narrative];
  if (args.facts?.length) contentParts.push('Facts: ' + args.facts.join('; '));
  if (args.concepts?.length) contentParts.push('Concepts: ' + args.concepts.join(', '));
  if (args.filesModified?.length) contentParts.push('Modified: ' + args.filesModified.join(', '));
  const content = contentParts.join('\n');

  database.prepare(`
    INSERT INTO memories (id, content, source, importance, access_count, last_accessed_at, created_at,
      title, observation_type, narrative, facts, concepts, files_read, files_modified)
    VALUES (?, ?, 'claude', ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, content, args.importance || 0.6, now, now,
    args.title, args.observationType, args.narrative,
    JSON.stringify(args.facts || []),
    JSON.stringify(args.concepts || []),
    JSON.stringify(args.filesRead || []),
    JSON.stringify(args.filesModified || [])
  );

  return {
    id, content, source: 'claude',
    importance: args.importance || 0.6,
    access_count: 0, created_at: now,
    title: args.title,
    observation_type: args.observationType,
    narrative: args.narrative,
    facts: args.facts || [],
    concepts: args.concepts || [],
    files_read: args.filesRead || [],
    files_modified: args.filesModified || []
  };
}

// ============================================================================
// PROGRESSIVE DISCLOSURE SEARCH (index-first, claude-mem inspired)
// ============================================================================

export interface MemoryIndexEntry {
  id: string;
  title: string | null;
  observation_type: string | null;
  importance: number;
  snippet: string;
  created_at: number;
}

/**
 * Lightweight search returning only IDs, titles, and short snippets.
 * ~50-100 tokens per result vs ~500-1000 for full fetch. Use this first,
 * then fetch full content only for relevant entries via memory_search.
 */
export function searchMemoriesIndex(query: string, limit: number = 20): MemoryIndexEntry[] {
  const database = getMemoryDatabase();
  const searchTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

  if (searchTerms.length === 0) {
    return database.prepare(`
      SELECT id, title, observation_type, importance, SUBSTR(content, 1, 80) as snippet, created_at
      FROM memories WHERE deleted_at IS NULL
      ORDER BY last_accessed_at DESC, importance DESC
      LIMIT ?
    `).all(limit) as MemoryIndexEntry[];
  }

  const likeClause = searchTerms.map(() => `LOWER(content) LIKE ?`).join(' OR ');
  const params = searchTerms.map(t => `%${t}%`);

  return database.prepare(`
    SELECT id, title, observation_type, importance, SUBSTR(content, 1, 80) as snippet, created_at,
      (${searchTerms.map(() => `(CASE WHEN LOWER(content) LIKE ? THEN 1 ELSE 0 END)`).join(' + ')}) as match_score
    FROM memories
    WHERE deleted_at IS NULL AND (${likeClause})
    ORDER BY match_score DESC, importance DESC
    LIMIT ?
  `).all([...params, ...params, limit]) as MemoryIndexEntry[];
}

export function searchMemories(query: string, limit: number = 10): Memory[] {
  const database = getMemoryDatabase();

  // Simple text search (full semantic search requires embedding server)
  const searchTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

  if (searchTerms.length === 0) {
    return database.prepare(`
      SELECT * FROM memories WHERE deleted_at IS NULL
      ORDER BY last_accessed_at DESC, importance DESC
      LIMIT ?
    `).all(limit) as Memory[];
  }

  // Build LIKE clauses for each term
  const likeClause = searchTerms.map(() => `LOWER(content) LIKE ?`).join(' OR ');
  const params = searchTerms.map(t => `%${t}%`);

  const results = database.prepare(`
    SELECT *,
      (${searchTerms.map(() => `(CASE WHEN LOWER(content) LIKE ? THEN 1 ELSE 0 END)`).join(' + ')}) as match_score
    FROM memories
    WHERE deleted_at IS NULL AND (${likeClause})
    ORDER BY match_score DESC, importance DESC, last_accessed_at DESC
    LIMIT ?
  `).all([...params, ...params, limit]) as Memory[];

  // Update access counts
  for (const memory of results) {
    database.prepare(`
      UPDATE memories SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?
    `).run(Date.now(), memory.id);
  }

  return results;
}

export function getAllMemories(limit: number = 100): Memory[] {
  const database = getMemoryDatabase();
  return database.prepare(`
    SELECT * FROM memories WHERE deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as Memory[];
}

export function deleteMemory(memoryId: string): boolean {
  const database = getMemoryDatabase();
  const result = database.prepare(`
    UPDATE memories SET deleted_at = ? WHERE id = ?
  `).run(Date.now(), memoryId);
  return result.changes > 0;
}

export function getMemoryStats(): {
  totalMemories: number;
  totalMessages: number;
  totalSessions: number;
} {
  const database = getMemoryDatabase();

  const totalMemories = database.prepare('SELECT COUNT(*) FROM memories WHERE deleted_at IS NULL').pluck().get() as number;

  // These tables are managed by the main database module but we can read them
  let totalMessages = 0;
  let totalSessions = 0;
  try {
    totalMessages = database.prepare('SELECT COUNT(*) FROM messages WHERE deleted_at IS NULL').pluck().get() as number;
    totalSessions = database.prepare('SELECT COUNT(*) FROM sessions WHERE deleted_at IS NULL').pluck().get() as number;
  } catch {
    // Tables may not exist yet if main database hasn't initialized
  }

  return { totalMemories, totalMessages, totalSessions };
}

// ============================================================================
// CONVERSATION THREADING (threads Claude messages into TARX chat history)
// ============================================================================

const CLAUDE_SPACE_NAME = 'Claude Memory';
const CLAUDE_SPACE_EMOJI = '🧠';

let currentSessionId: string | null = null;
let currentSessionTimestamp: number = 0;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

function getOrCreateClaudeSpace(): { id: string; name: string } {
  const database = getMemoryDatabase();

  let space = database.prepare(`
    SELECT id, name FROM spaces WHERE name = ? AND deleted_at IS NULL
  `).get(CLAUDE_SPACE_NAME) as { id: string; name: string } | undefined;

  if (!space) {
    const now = Date.now();
    const id = randomUUID();

    database.prepare(`
      INSERT INTO spaces (id, name, description, emoji, created_at, updated_at, last_accessed_at, message_count, total_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)
    `).run(id, CLAUDE_SPACE_NAME, 'Conversations from Claude Desktop', CLAUDE_SPACE_EMOJI, now, now, now);

    space = { id, name: CLAUDE_SPACE_NAME };
  }

  return space;
}

function getCurrentSession(): { sessionId: string; spaceId: string; isNew: boolean } {
  const now = Date.now();
  const space = getOrCreateClaudeSpace();

  if (currentSessionId && (now - currentSessionTimestamp) < SESSION_TIMEOUT_MS) {
    currentSessionTimestamp = now;
    return { sessionId: currentSessionId, spaceId: space.id, isNew: false };
  }

  const database = getMemoryDatabase();
  const sessionId = randomUUID();
  const title = `Claude ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;

  database.prepare(`
    INSERT INTO sessions (id, space_id, title, created_at, updated_at, message_count, total_tokens, model)
    VALUES (?, ?, ?, ?, ?, 0, 0, 'claude')
  `).run(sessionId, space.id, title, now, now);

  // BRIDGE: Also create TARX-native conversation for sidebar
  try {
    database.prepare(`
      INSERT OR IGNORE INTO conversations (id, project_id, title, created_at, updated_at)
      VALUES (?, NULL, ?, ?, ?)
    `).run(sessionId, title, now, now);
  } catch { /* conversations table may not exist */ }

  currentSessionId = sessionId;
  currentSessionTimestamp = now;

  return { sessionId, spaceId: space.id, isNew: true };
}

export function threadMessage(
  role: 'user' | 'assistant' | 'system',
  content: string,
  metadata?: { tokens?: number }
): { messageId: string; sessionId: string } {
  const database = getMemoryDatabase();
  const { sessionId } = getCurrentSession();
  const now = Date.now();
  const messageId = randomUUID();

  database.prepare(`
    INSERT INTO messages (id, session_id, role, content, created_at, model, tokens)
    VALUES (?, ?, ?, ?, ?, 'claude', ?)
  `).run(messageId, sessionId, role, content, now, metadata?.tokens || null);

  // BRIDGE: Also store in TARX-native conversation_turns
  try {
    database.prepare(`
      INSERT OR IGNORE INTO conversation_turns (id, conversation_id, role, content, file_refs, created_at)
      VALUES (?, ?, ?, ?, '[]', ?)
    `).run(messageId, sessionId, role, content, now);

    database.prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`).run(now, sessionId);
  } catch { /* conversations table may not exist */ }

  database.prepare(`UPDATE sessions SET message_count = message_count + 1, updated_at = ? WHERE id = ?`).run(now, sessionId);

  database.prepare(`
    UPDATE spaces SET message_count = message_count + 1, updated_at = ?, last_accessed_at = ?
    WHERE id = (SELECT space_id FROM sessions WHERE id = ?)
  `).run(now, now, sessionId);

  return { messageId, sessionId };
}

export function getRecentMessages(limit: number = 50): Array<{ id: string; role: string; content: string; created_at: number }> {
  const database = getMemoryDatabase();
  const space = getOrCreateClaudeSpace();

  return database.prepare(`
    SELECT m.id, m.role, m.content, m.created_at FROM messages m
    JOIN sessions s ON m.session_id = s.id
    WHERE s.space_id = ? AND m.deleted_at IS NULL
    ORDER BY m.created_at DESC
    LIMIT ?
  `).all(space.id, limit) as Array<{ id: string; role: string; content: string; created_at: number }>;
}

// ============================================================================
// CLAUDE.AI SESSION SYNC
// ============================================================================

const CLAUDE_AI_SPACE_NAME = 'Claude AI Sessions';
const CLAUDE_AI_SPACE_EMOJI = '🤖';

function getOrCreateClaudeAISpace(): { id: string; name: string } {
  const database = getMemoryDatabase();

  let space = database.prepare(`
    SELECT id, name FROM spaces WHERE name = ? AND deleted_at IS NULL
  `).get(CLAUDE_AI_SPACE_NAME) as { id: string; name: string } | undefined;

  if (!space) {
    const now = Date.now();
    const id = randomUUID();

    database.prepare(`
      INSERT INTO spaces (id, name, description, emoji, created_at, updated_at, last_accessed_at, message_count, total_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)
    `).run(id, CLAUDE_AI_SPACE_NAME, 'Conversations synced from Claude.ai', CLAUDE_AI_SPACE_EMOJI, now, now, now);

    space = { id, name: CLAUDE_AI_SPACE_NAME };
  }

  return space;
}

export function createMemorySession(args: {
  title: string;
  topic?: string;
  metadata?: Record<string, unknown>;
}): { session_id: string; title: string; space_id: string; created_at: number; view_url: string } {
  const database = getMemoryDatabase();
  const space = getOrCreateClaudeAISpace();
  const now = Date.now();
  const sessionId = randomUUID();

  database.prepare(`
    INSERT INTO sessions (id, space_id, title, topic, metadata, created_at, updated_at, last_activity, message_count, total_tokens, model)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'claude.ai')
  `).run(sessionId, space.id, args.title, args.topic || null, args.metadata ? JSON.stringify(args.metadata) : null, now, now, now);

  // BRIDGE: Also create TARX-native conversation for sidebar
  try {
    database.prepare(`
      INSERT OR IGNORE INTO conversations (id, project_id, title, created_at, updated_at)
      VALUES (?, NULL, ?, ?, ?)
    `).run(sessionId, args.title, now, now);
  } catch { /* conversations table may not exist */ }

  return {
    session_id: sessionId,
    title: args.title,
    space_id: space.id,
    created_at: now,
    view_url: `tarx://session/${sessionId}`
  };
}

export function threadToSession(args: {
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: Record<string, unknown>;
}): { message_id: string; session_id: string; threaded: boolean; timestamp: number } {
  const database = getMemoryDatabase();
  const now = Date.now();
  const messageId = randomUUID();

  const session = database.prepare('SELECT id, space_id FROM sessions WHERE id = ? AND deleted_at IS NULL').get(args.session_id) as { id: string; space_id: string } | undefined;
  if (!session) {
    throw new Error(`Session ${args.session_id} not found`);
  }

  database.prepare(`
    INSERT INTO messages (id, session_id, role, content, metadata, created_at, model)
    VALUES (?, ?, ?, ?, ?, ?, 'claude.ai')
  `).run(messageId, args.session_id, args.role, args.content, args.metadata ? JSON.stringify(args.metadata) : null, now);

  // BRIDGE: Also store in TARX-native conversation_turns
  try {
    database.prepare(`
      INSERT OR IGNORE INTO conversation_turns (id, conversation_id, role, content, file_refs, created_at)
      VALUES (?, ?, ?, ?, '[]', ?)
    `).run(messageId, args.session_id, args.role, args.content, now);

    database.prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`).run(now, args.session_id);
  } catch { /* conversations table may not exist */ }

  database.prepare(`UPDATE sessions SET last_activity = ?, updated_at = ?, message_count = message_count + 1 WHERE id = ?`).run(now, now, args.session_id);
  database.prepare(`UPDATE spaces SET message_count = message_count + 1, updated_at = ?, last_accessed_at = ? WHERE id = ?`).run(now, now, session.space_id);

  return { message_id: messageId, session_id: args.session_id, threaded: true, timestamp: now };
}

export interface SessionMessage {
  id: string;
  role: string;
  content: string;
  created_at: number;
  metadata?: Record<string, unknown>;
}

export function getSessionHistory(args: {
  session_id: string;
  limit?: number;
  include_metadata?: boolean;
}): {
  session_id: string;
  title: string | null;
  topic: string | null;
  created_at: number;
  last_activity: number | null;
  messages: SessionMessage[];
  total_messages: number;
  token_estimate: number;
  view_url: string;
} {
  const database = getMemoryDatabase();
  const limit = args.limit || 100;
  const includeMetadata = args.include_metadata !== false;

  const session = database.prepare(`
    SELECT id, title, topic, created_at, last_activity FROM sessions WHERE id = ? AND deleted_at IS NULL
  `).get(args.session_id) as { id: string; title: string | null; topic: string | null; created_at: number; last_activity: number | null } | undefined;

  if (!session) {
    throw new Error(`Session ${args.session_id} not found`);
  }

  const rawMessages = database.prepare(`
    SELECT id, role, content, metadata, created_at
    FROM messages WHERE session_id = ? AND deleted_at IS NULL
    ORDER BY created_at ASC LIMIT ?
  `).all(args.session_id, limit) as { id: string; role: string; content: string; metadata: string | null; created_at: number }[];

  const messages: SessionMessage[] = rawMessages.map(m => {
    const msg: SessionMessage = { id: m.id, role: m.role, content: m.content, created_at: m.created_at };
    if (includeMetadata && m.metadata) {
      try { msg.metadata = JSON.parse(m.metadata); } catch { /* skip */ }
    }
    return msg;
  });

  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);

  return {
    session_id: args.session_id,
    title: session.title,
    topic: session.topic,
    created_at: session.created_at,
    last_activity: session.last_activity,
    messages,
    total_messages: messages.length,
    token_estimate: Math.ceil(totalChars / 4),
    view_url: `tarx://session/${args.session_id}`
  };
}

export function listMemorySessions(): Array<{
  id: string;
  title: string | null;
  topic: string | null;
  message_count: number;
  created_at: number;
  last_activity: number | null;
}> {
  const database = getMemoryDatabase();
  const space = getOrCreateClaudeAISpace();

  return database.prepare(`
    SELECT id, title, topic, message_count, created_at, last_activity
    FROM sessions
    WHERE space_id = ? AND deleted_at IS NULL
    ORDER BY COALESCE(last_activity, created_at) DESC
    LIMIT 50
  `).all(space.id) as Array<{
    id: string;
    title: string | null;
    topic: string | null;
    message_count: number;
    created_at: number;
    last_activity: number | null;
  }>;
}
