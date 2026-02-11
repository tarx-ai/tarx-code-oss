/**
 * TARX Claude Memory - Database Layer
 *
 * Shared database with TARX app for unified memory storage.
 * All Claude conversations are threaded into TARX chat history.
 */

import Database from 'better-sqlite3';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';

// Database path - shared with TARX app
const DB_DIR = join(homedir(), 'Library/Application Support/tarx');
const DB_PATH = join(DB_DIR, 'memory.db');

// Ensure directory exists
if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
}

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initSchema();
  }
  return db;
}

function initSchema(): void {
  const database = getDatabase();

  // Ensure core tables exist (compatible with TARX app)
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

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      title TEXT,
      topic TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_activity INTEGER,
      message_count INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      model TEXT,
      deleted_at INTEGER,
      FOREIGN KEY (space_id) REFERENCES spaces(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      model TEXT,
      tokens INTEGER,
      latency_ms INTEGER,
      deleted_at INTEGER,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    -- Memory table for semantic storage
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

    -- TARX-native tables (for sidebar integration)
    -- Bridge: Claude sessions also appear as TARX conversations
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      title TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversation_turns (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      file_refs TEXT DEFAULT '[]',
      artifacts TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );

    CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_space ON sessions(space_id);
    CREATE INDEX IF NOT EXISTS idx_conversation_turns_conv ON conversation_turns(conversation_id);
  `);

  // Migration: Add new columns to existing tables if they don't exist
  // Run these BEFORE creating indexes that depend on these columns
  try {
    database.exec(`ALTER TABLE sessions ADD COLUMN topic TEXT`);
  } catch { /* Column already exists */ }

  try {
    database.exec(`ALTER TABLE sessions ADD COLUMN metadata TEXT`);
  } catch { /* Column already exists */ }

  try {
    database.exec(`ALTER TABLE sessions ADD COLUMN last_activity INTEGER`);
  } catch { /* Column already exists */ }

  try {
    database.exec(`ALTER TABLE messages ADD COLUMN metadata TEXT`);
  } catch { /* Column already exists */ }

  // Create indexes that depend on migrated columns
  try {
    database.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_activity ON sessions(last_activity)`);
  } catch { /* Index might already exist or column migration failed */ }
}

// ============================================================================
// CLAUDE SPACE MANAGEMENT
// ============================================================================

const CLAUDE_SPACE_NAME = 'Claude Memory';
const CLAUDE_SPACE_EMOJI = '🧠';

export interface Space {
  id: string;
  name: string;
  description: string | null;
  emoji: string;
  created_at: number;
  updated_at: number;
  last_accessed_at: number;
  message_count: number;
  total_tokens: number;
}

export function getOrCreateClaudeSpace(): Space {
  const database = getDatabase();

  let space = database.prepare(`
    SELECT * FROM spaces WHERE name = ? AND deleted_at IS NULL
  `).get(CLAUDE_SPACE_NAME) as Space | undefined;

  if (!space) {
    const now = Date.now();
    const id = randomUUID();

    database.prepare(`
      INSERT INTO spaces (id, name, description, emoji, created_at, updated_at, last_accessed_at, message_count, total_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)
    `).run(id, CLAUDE_SPACE_NAME, 'Conversations from Claude Desktop', CLAUDE_SPACE_EMOJI, now, now, now);

    space = {
      id,
      name: CLAUDE_SPACE_NAME,
      description: 'Conversations from Claude Desktop',
      emoji: CLAUDE_SPACE_EMOJI,
      created_at: now,
      updated_at: now,
      last_accessed_at: now,
      message_count: 0,
      total_tokens: 0
    };
  }

  return space;
}

// ============================================================================
// SESSION MANAGEMENT (threads Claude conversations)
// ============================================================================

let currentSessionId: string | null = null;
let currentSessionTimestamp: number = 0;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export interface Session {
  id: string;
  space_id: string;
  title: string | null;
  created_at: number;
  updated_at: number;
  message_count: number;
}

export function getCurrentSession(): { sessionId: string; spaceId: string; isNew: boolean } {
  const now = Date.now();
  const space = getOrCreateClaudeSpace();

  // Reuse session if within timeout
  if (currentSessionId && (now - currentSessionTimestamp) < SESSION_TIMEOUT_MS) {
    currentSessionTimestamp = now;
    return { sessionId: currentSessionId, spaceId: space.id, isNew: false };
  }

  // Create new session
  const database = getDatabase();
  const sessionId = randomUUID();
  const title = `Claude ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;

  database.prepare(`
    INSERT INTO sessions (id, space_id, title, created_at, updated_at, message_count, total_tokens, model)
    VALUES (?, ?, ?, ?, ?, 0, 0, 'claude')
  `).run(sessionId, space.id, title, now, now);

  // BRIDGE: Also create TARX-native conversation for sidebar
  database.prepare(`
    INSERT OR IGNORE INTO conversations (id, project_id, title, created_at, updated_at)
    VALUES (?, NULL, ?, ?, ?)
  `).run(sessionId, title, now, now);

  currentSessionId = sessionId;
  currentSessionTimestamp = now;

  return { sessionId, spaceId: space.id, isNew: true };
}

// ============================================================================
// MESSAGE THREADING (threads into TARX chat history)
// ============================================================================

export interface Message {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: number;
}

export function storeMessage(
  role: 'user' | 'assistant' | 'system',
  content: string,
  metadata?: { tokens?: number }
): { messageId: string; sessionId: string } {
  const database = getDatabase();
  const { sessionId } = getCurrentSession();
  const now = Date.now();
  const messageId = randomUUID();

  // Store message in MCP schema
  database.prepare(`
    INSERT INTO messages (id, session_id, role, content, created_at, model, tokens)
    VALUES (?, ?, ?, ?, ?, 'claude', ?)
  `).run(messageId, sessionId, role, content, now, metadata?.tokens || null);

  // BRIDGE: Also store in TARX-native conversation_turns for sidebar
  database.prepare(`
    INSERT OR IGNORE INTO conversation_turns (id, conversation_id, role, content, file_refs, created_at)
    VALUES (?, ?, ?, ?, '[]', ?)
  `).run(messageId, sessionId, role, content, now);

  // Update TARX-native conversation timestamp
  database.prepare(`
    UPDATE conversations SET updated_at = ? WHERE id = ?
  `).run(now, sessionId);

  // Update session stats
  database.prepare(`
    UPDATE sessions SET message_count = message_count + 1, updated_at = ? WHERE id = ?
  `).run(now, sessionId);

  // Update space stats
  database.prepare(`
    UPDATE spaces SET message_count = message_count + 1, updated_at = ?, last_accessed_at = ?
    WHERE id = (SELECT space_id FROM sessions WHERE id = ?)
  `).run(now, now, sessionId);

  return { messageId, sessionId };
}

export function getRecentMessages(limit: number = 50): Message[] {
  const database = getDatabase();
  const space = getOrCreateClaudeSpace();

  return database.prepare(`
    SELECT m.* FROM messages m
    JOIN sessions s ON m.session_id = s.id
    WHERE s.space_id = ? AND m.deleted_at IS NULL
    ORDER BY m.created_at DESC
    LIMIT ?
  `).all(space.id, limit) as Message[];
}

// ============================================================================
// MEMORY STORAGE (semantic memory)
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
  const database = getDatabase();
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

export function searchMemories(query: string, limit: number = 10): Memory[] {
  const database = getDatabase();

  // Simple text search (full semantic search requires embedding server)
  // This provides basic functionality without external dependencies
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
  const database = getDatabase();
  return database.prepare(`
    SELECT * FROM memories WHERE deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as Memory[];
}

export function deleteMemory(memoryId: string): boolean {
  const database = getDatabase();
  const result = database.prepare(`
    UPDATE memories SET deleted_at = ? WHERE id = ?
  `).run(Date.now(), memoryId);
  return result.changes > 0;
}

// ============================================================================
// STATS
// ============================================================================

export function getStats(): {
  totalMemories: number;
  totalMessages: number;
  totalSessions: number;
  claudeSpace: Space | null;
} {
  const database = getDatabase();

  const totalMemories = database.prepare('SELECT COUNT(*) FROM memories WHERE deleted_at IS NULL').pluck().get() as number;
  const totalMessages = database.prepare('SELECT COUNT(*) FROM messages WHERE deleted_at IS NULL').pluck().get() as number;
  const totalSessions = database.prepare('SELECT COUNT(*) FROM sessions WHERE deleted_at IS NULL').pluck().get() as number;

  let claudeSpace: Space | null = null;
  try {
    claudeSpace = getOrCreateClaudeSpace();
  } catch {}

  return { totalMemories, totalMessages, totalSessions, claudeSpace };
}

// ============================================================================
// CLAUDE.AI SESSION SYNC (New Tools for Claude.ai Integration)
// ============================================================================

const CLAUDE_AI_SPACE_NAME = 'Claude.ai Sessions';
const CLAUDE_AI_SPACE_EMOJI = '🤖';

/**
 * Get or create dedicated space for Claude.ai sessions
 */
export function getOrCreateClaudeAISpace(): Space {
  const database = getDatabase();

  let space = database.prepare(`
    SELECT * FROM spaces WHERE name = ? AND deleted_at IS NULL
  `).get(CLAUDE_AI_SPACE_NAME) as Space | undefined;

  if (!space) {
    const now = Date.now();
    const id = randomUUID();

    database.prepare(`
      INSERT INTO spaces (id, name, description, emoji, created_at, updated_at, last_accessed_at, message_count, total_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)
    `).run(id, CLAUDE_AI_SPACE_NAME, 'Conversations synced from Claude.ai', CLAUDE_AI_SPACE_EMOJI, now, now, now);

    space = {
      id,
      name: CLAUDE_AI_SPACE_NAME,
      description: 'Conversations synced from Claude.ai',
      emoji: CLAUDE_AI_SPACE_EMOJI,
      created_at: now,
      updated_at: now,
      last_accessed_at: now,
      message_count: 0,
      total_tokens: 0
    };
  }

  return space;
}

export interface CreateSessionResult {
  session_id: string;
  title: string;
  space_id: string;
  created_at: number;
  view_url: string;
}

/**
 * Create a dedicated session for a Claude.ai conversation
 */
export function createSession(args: {
  title: string;
  topic?: string;
  metadata?: Record<string, unknown>;
}): CreateSessionResult {
  const database = getDatabase();
  const space = getOrCreateClaudeAISpace();
  const now = Date.now();
  const sessionId = randomUUID();

  database.prepare(`
    INSERT INTO sessions (id, space_id, title, topic, metadata, created_at, updated_at, last_activity, message_count, total_tokens, model)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'claude.ai')
  `).run(
    sessionId,
    space.id,
    args.title,
    args.topic || null,
    args.metadata ? JSON.stringify(args.metadata) : null,
    now,
    now,
    now
  );

  // BRIDGE: Also create TARX-native conversation for sidebar
  database.prepare(`
    INSERT OR IGNORE INTO conversations (id, project_id, title, created_at, updated_at)
    VALUES (?, NULL, ?, ?, ?)
  `).run(sessionId, args.title, now, now);

  return {
    session_id: sessionId,
    title: args.title,
    space_id: space.id,
    created_at: now,
    view_url: `tarx://session/${sessionId}`
  };
}

export interface ThreadToSessionResult {
  message_id: string;
  session_id: string;
  threaded: boolean;
  timestamp: number;
}

/**
 * Thread a message to a specific session
 */
export function threadToSession(args: {
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: Record<string, unknown>;
}): ThreadToSessionResult {
  const database = getDatabase();
  const now = Date.now();
  const messageId = randomUUID();

  // Verify session exists
  const session = database.prepare('SELECT id, space_id FROM sessions WHERE id = ? AND deleted_at IS NULL').get(args.session_id) as { id: string; space_id: string } | undefined;

  if (!session) {
    throw new Error(`Session ${args.session_id} not found`);
  }

  // Store message
  database.prepare(`
    INSERT INTO messages (id, session_id, role, content, metadata, created_at, model)
    VALUES (?, ?, ?, ?, ?, ?, 'claude.ai')
  `).run(
    messageId,
    args.session_id,
    args.role,
    args.content,
    args.metadata ? JSON.stringify(args.metadata) : null,
    now
  );

  // BRIDGE: Also store in TARX-native conversation_turns for sidebar
  database.prepare(`
    INSERT OR IGNORE INTO conversation_turns (id, conversation_id, role, content, file_refs, created_at)
    VALUES (?, ?, ?, ?, '[]', ?)
  `).run(messageId, args.session_id, args.role, args.content, now);

  // Update session last_activity and message_count
  database.prepare(`
    UPDATE sessions SET last_activity = ?, updated_at = ?, message_count = message_count + 1 WHERE id = ?
  `).run(now, now, args.session_id);

  // Update TARX-native conversation timestamp
  database.prepare(`
    UPDATE conversations SET updated_at = ? WHERE id = ?
  `).run(now, args.session_id);

  // Update space stats
  database.prepare(`
    UPDATE spaces SET message_count = message_count + 1, updated_at = ?, last_accessed_at = ? WHERE id = ?
  `).run(now, now, session.space_id);

  return {
    message_id: messageId,
    session_id: args.session_id,
    threaded: true,
    timestamp: now
  };
}

export interface SessionMessage {
  id: string;
  role: string;
  content: string;
  created_at: number;
  metadata?: Record<string, unknown>;
}

export interface GetSessionResult {
  session_id: string;
  title: string | null;
  topic: string | null;
  created_at: number;
  last_activity: number | null;
  messages: SessionMessage[];
  total_messages: number;
  token_estimate: number;
  view_url: string;
}

/**
 * Get full session history
 */
export function getSessionHistory(args: {
  session_id: string;
  limit?: number;
  include_metadata?: boolean;
}): GetSessionResult {
  const database = getDatabase();
  const limit = args.limit || 100;
  const includeMetadata = args.include_metadata !== false;

  // Get session info
  const session = database.prepare(`
    SELECT id, title, topic, created_at, last_activity FROM sessions WHERE id = ? AND deleted_at IS NULL
  `).get(args.session_id) as { id: string; title: string | null; topic: string | null; created_at: number; last_activity: number | null } | undefined;

  if (!session) {
    throw new Error(`Session ${args.session_id} not found`);
  }

  // Get messages
  const rawMessages = database.prepare(`
    SELECT id, role, content, metadata, created_at
    FROM messages
    WHERE session_id = ? AND deleted_at IS NULL
    ORDER BY created_at ASC
    LIMIT ?
  `).all(args.session_id, limit) as { id: string; role: string; content: string; metadata: string | null; created_at: number }[];

  // Format messages
  const messages: SessionMessage[] = rawMessages.map(m => {
    const msg: SessionMessage = {
      id: m.id,
      role: m.role,
      content: m.content,
      created_at: m.created_at
    };

    if (includeMetadata && m.metadata) {
      try {
        msg.metadata = JSON.parse(m.metadata);
      } catch { /* Invalid JSON, skip */ }
    }

    return msg;
  });

  // Calculate token estimate (rough: ~4 chars per token)
  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  const tokenEstimate = Math.ceil(totalChars / 4);

  return {
    session_id: args.session_id,
    title: session.title,
    topic: session.topic,
    created_at: session.created_at,
    last_activity: session.last_activity,
    messages,
    total_messages: messages.length,
    token_estimate: tokenEstimate,
    view_url: `tarx://session/${args.session_id}`
  };
}

/**
 * Get or create default session for backward compatibility with thread_message
 */
export function getOrCreateDefaultSession(): string {
  const database = getDatabase();
  const space = getOrCreateClaudeAISpace();

  // Look for existing default session
  const defaultSession = database.prepare(`
    SELECT id FROM sessions
    WHERE title = 'Default Session' AND space_id = ? AND deleted_at IS NULL
  `).get(space.id) as { id: string } | undefined;

  if (defaultSession) {
    return defaultSession.id;
  }

  // Create default session
  const now = Date.now();
  const sessionId = randomUUID();

  database.prepare(`
    INSERT INTO sessions (id, space_id, title, created_at, updated_at, last_activity, message_count, total_tokens, model)
    VALUES (?, ?, 'Default Session', ?, ?, ?, 0, 0, 'claude.ai')
  `).run(sessionId, space.id, now, now, now);

  // BRIDGE: Also create TARX-native conversation
  database.prepare(`
    INSERT OR IGNORE INTO conversations (id, project_id, title, created_at, updated_at)
    VALUES (?, NULL, 'Default Session', ?, ?)
  `).run(sessionId, now, now);

  return sessionId;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
