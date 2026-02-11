/**
 * TARX Shared Database Module
 *
 * SINGLE SOURCE OF TRUTH for all TARX MCP servers.
 * All data persists in ~/Library/Application Support/tarx/memory.db
 *
 * This module consolidates:
 * - User MCP (spaces, sessions, messages)
 * - Admin MCP (admin sessions, tasks, file locks)
 * - Orchestration MCP (orchestration sessions, tasks, milestones)
 * - Memory MCP (memories)
 *
 * RULE: Every MCP server imports from here. No separate databases.
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';

// CANONICAL DATABASE PATH - ALL MCPs USE THIS
const DB_DIR = path.join(homedir(), 'Library/Application Support/tarx');
const DB_PATH = path.join(DB_DIR, 'memory.db');

// Ensure directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Initialize database connection
const db: DatabaseType = new Database(DB_PATH);

// Enable foreign keys and WAL mode for better performance
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

/**
 * Initialize all consolidated schema
 * This adds tables from admin-mcp and orchestration-mcp to the main database
 */
function initializeConsolidatedSchema(): void {
  // ============================================================================
  // EXISTING TABLES (already in memory.db - don't recreate)
  // ============================================================================
  // spaces, sessions, messages, conversations, conversation_turns,
  // projects, project_files, files, chunk_embeddings, etc.

  // ============================================================================
  // MEMORIES TABLE (migrated from tarx-memory in-memory storage)
  // ============================================================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      embedding BLOB,
      source TEXT DEFAULT 'default',
      source_id TEXT,
      importance REAL DEFAULT 0.5,
      access_count INTEGER DEFAULT 0,
      last_accessed_at INTEGER,
      created_at INTEGER NOT NULL
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_source ON memories(source)`);

  // ============================================================================
  // ADMIN MCP TABLES (migrated from ~/.tarx/admin-sessions.db)
  // ============================================================================

  // Admin sessions - track Claude Code instances
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      current_task TEXT,
      working_directory TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_activity_at INTEGER NOT NULL,
      metadata TEXT DEFAULT '{}'
    )
  `);

  // Admin tasks
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_tasks (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      priority INTEGER NOT NULL DEFAULT 0,
      dependencies TEXT DEFAULT '[]',
      blocked_by TEXT,
      started_at INTEGER,
      completed_at INTEGER,
      result TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES admin_sessions(id) ON DELETE CASCADE
    )
  `);

  // Admin file locks
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_file_locks (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      lock_type TEXT NOT NULL DEFAULT 'exclusive',
      acquired_at INTEGER NOT NULL,
      expires_at INTEGER,
      reason TEXT,
      FOREIGN KEY (session_id) REFERENCES admin_sessions(id) ON DELETE CASCADE
    )
  `);

  // Admin dependencies
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_dependencies (
      id TEXT PRIMARY KEY,
      from_session_id TEXT NOT NULL,
      to_session_id TEXT NOT NULL,
      task_id TEXT,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting',
      created_at INTEGER NOT NULL,
      satisfied_at INTEGER,
      FOREIGN KEY (from_session_id) REFERENCES admin_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (to_session_id) REFERENCES admin_sessions(id) ON DELETE CASCADE
    )
  `);

  // Admin handoffs
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_handoffs (
      id TEXT PRIMARY KEY,
      from_session_id TEXT NOT NULL,
      to_session_id TEXT NOT NULL,
      task_description TEXT NOT NULL,
      context TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      accepted_at INTEGER,
      completed_at INTEGER,
      FOREIGN KEY (from_session_id) REFERENCES admin_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (to_session_id) REFERENCES admin_sessions(id) ON DELETE CASCADE
    )
  `);

  // Admin activity log
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES admin_sessions(id) ON DELETE CASCADE
    )
  `);

  // Admin milestones
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_milestones (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      required_tasks TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending',
      progress REAL DEFAULT 0,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    )
  `);

  // ============================================================================
  // ORCHESTRATION MCP TABLES (migrated from ~/.tarx/orchestration.db)
  // ============================================================================

  // Orchestration sessions
  db.exec(`
    CREATE TABLE IF NOT EXISTS orch_sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      workspace_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      current_file TEXT,
      current_task TEXT,
      thinking_notes TEXT,
      last_command TEXT,
      last_output TEXT,
      error_state TEXT,
      last_activity INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  // Orchestration session activity
  db.exec(`
    CREATE TABLE IF NOT EXISTS orch_session_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      activity_type TEXT NOT NULL,
      details TEXT,
      FOREIGN KEY (session_id) REFERENCES orch_sessions(id) ON DELETE CASCADE
    )
  `);

  // Orchestration session files
  db.exec(`
    CREATE TABLE IF NOT EXISTS orch_session_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      opened_at INTEGER NOT NULL,
      is_active INTEGER DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES orch_sessions(id) ON DELETE CASCADE
    )
  `);

  // Orchestration tasks
  db.exec(`
    CREATE TABLE IF NOT EXISTS orch_tasks (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      milestone_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      priority TEXT NOT NULL DEFAULT 'medium',
      assigned_at INTEGER NOT NULL,
      started_at INTEGER,
      completed_at INTEGER,
      blocked_by TEXT,
      result TEXT,
      FOREIGN KEY (session_id) REFERENCES orch_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (milestone_id) REFERENCES orch_milestones(id) ON DELETE SET NULL
    )
  `);

  // Orchestration milestones
  db.exec(`
    CREATE TABLE IF NOT EXISTS orch_milestones (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      target_date INTEGER,
      progress INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      completed_at INTEGER,
      created_at INTEGER NOT NULL
    )
  `);

  // Orchestration managed docs
  db.exec(`
    CREATE TABLE IF NOT EXISTS orch_managed_docs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      last_updated INTEGER NOT NULL,
      update_count INTEGER DEFAULT 1,
      FOREIGN KEY (session_id) REFERENCES orch_sessions(id) ON DELETE CASCADE
    )
  `);

  // Orchestration doc history
  db.exec(`
    CREATE TABLE IF NOT EXISTS orch_doc_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_id INTEGER NOT NULL,
      session_id TEXT NOT NULL,
      change_type TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (doc_id) REFERENCES orch_managed_docs(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES orch_sessions(id) ON DELETE CASCADE
    )
  `);

  // Orchestration feedback requests
  db.exec(`
    CREATE TABLE IF NOT EXISTS orch_feedback_requests (
      id TEXT PRIMARY KEY,
      topic TEXT NOT NULL,
      context TEXT NOT NULL,
      options TEXT,
      urgency TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'pending',
      response TEXT,
      created_at INTEGER NOT NULL,
      responded_at INTEGER
    )
  `);

  // Orchestration context updates
  db.exec(`
    CREATE TABLE IF NOT EXISTS orch_context_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_session_id TEXT,
      to_session_id TEXT,
      update_type TEXT NOT NULL,
      message TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'normal',
      delivered INTEGER DEFAULT 0,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (from_session_id) REFERENCES orch_sessions(id) ON DELETE SET NULL,
      FOREIGN KEY (to_session_id) REFERENCES orch_sessions(id) ON DELETE CASCADE
    )
  `);

  // Orchestration external models
  db.exec(`
    CREATE TABLE IF NOT EXISTS orch_external_models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      api_endpoint TEXT NOT NULL,
      model_id TEXT NOT NULL,
      capabilities TEXT,
      cost_per_1k_tokens REAL DEFAULT 0,
      max_tokens INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Orchestration model API keys
  db.exec(`
    CREATE TABLE IF NOT EXISTS orch_model_api_keys (
      id TEXT PRIMARY KEY,
      model_id TEXT NOT NULL,
      encrypted_key TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER,
      FOREIGN KEY (model_id) REFERENCES orch_external_models(id) ON DELETE CASCADE
    )
  `);

  // Orchestration routing rules
  db.exec(`
    CREATE TABLE IF NOT EXISTS orch_routing_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      condition TEXT NOT NULL,
      target_model_id TEXT NOT NULL,
      fallback_model_id TEXT,
      enabled INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (target_model_id) REFERENCES orch_external_models(id) ON DELETE CASCADE,
      FOREIGN KEY (fallback_model_id) REFERENCES orch_external_models(id) ON DELETE SET NULL
    )
  `);

  // Orchestration model usage
  db.exec(`
    CREATE TABLE IF NOT EXISTS orch_model_usage (
      id TEXT PRIMARY KEY,
      model_id TEXT NOT NULL,
      session_id TEXT,
      query_type TEXT,
      tokens_used INTEGER DEFAULT 0,
      latency_ms INTEGER DEFAULT 0,
      cost REAL DEFAULT 0,
      success INTEGER DEFAULT 1,
      error_message TEXT,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (model_id) REFERENCES orch_external_models(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES orch_sessions(id) ON DELETE SET NULL
    )
  `);

  // Orchestration blockers
  db.exec(`
    CREATE TABLE IF NOT EXISTS orch_blockers (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      description TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      blocks_task_ids TEXT,
      needs_user_input INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      resolution TEXT,
      created_at INTEGER NOT NULL,
      resolved_at INTEGER,
      FOREIGN KEY (session_id) REFERENCES orch_sessions(id) ON DELETE CASCADE
    )
  `);

  // ============================================================================
  // CREATE INDEXES for performance
  // ============================================================================

  // Admin indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_admin_tasks_session ON admin_tasks(session_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_admin_activity_session ON admin_activity_log(session_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_admin_locks_session ON admin_file_locks(session_id)`);

  // Orchestration indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_orch_session_activity_session ON orch_session_activity(session_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_orch_tasks_session ON orch_tasks(session_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_orch_tasks_milestone ON orch_tasks(milestone_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_orch_tasks_status ON orch_tasks(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_orch_context_updates_to ON orch_context_updates(to_session_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_orch_blockers_session ON orch_blockers(session_id)`);

  // ============================================================================
  // VIEWS for backwards compatibility (orchestration uses unprefixed names)
  // ============================================================================

  // Drop views if they exist, then recreate
  const viewMappings = [
    ['sessions', 'orch_sessions'],
    ['session_activity', 'orch_session_activity'],
    ['session_files', 'orch_session_files'],
    ['tasks', 'orch_tasks'],
    ['milestones', 'orch_milestones'],
    ['managed_docs', 'orch_managed_docs'],
    ['doc_history', 'orch_doc_history'],
    ['feedback_requests', 'orch_feedback_requests'],
    ['context_updates', 'orch_context_updates'],
    ['external_models', 'orch_external_models'],
    ['model_api_keys', 'orch_model_api_keys'],
    ['routing_rules', 'orch_routing_rules'],
    ['model_usage', 'orch_model_usage'],
    ['blockers', 'orch_blockers'],
  ];

  for (const [viewName, tableName] of viewMappings) {
    // Check if view already exists
    const existingView = db.prepare(`SELECT name FROM sqlite_master WHERE type='view' AND name=?`).get(viewName);
    if (!existingView) {
      try {
        // Note: SQLite views are read-only for complex views, but INSTEAD OF triggers can enable writes
        // For simplicity, we'll create a simple view and handle writes via the prefixed table name
        db.exec(`CREATE VIEW IF NOT EXISTS ${viewName} AS SELECT * FROM ${tableName}`);
      } catch (e) {
        // View might conflict with existing table, ignore
      }
    }
  }

  console.error('[TARX Shared DB] Consolidated schema initialized');
}

// Initialize schema on module load
initializeConsolidatedSchema();

// Export the database and path
export { db, DB_PATH, DB_DIR };

// Export a function to get fresh connection (for testing)
export function getDatabase(): DatabaseType {
  return db;
}

// Export function to close database (for cleanup)
export function closeDatabase(): void {
  db.close();
}
