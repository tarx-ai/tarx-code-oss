/**
 * TARX ↔ Claude Code Tether
 *
 * Bridges Claude Code CLI sessions with TARX persistent storage.
 * Every CC session gets:
 *   1. A TARX session (for message threading)
 *   2. An orchestration registration (for status tracking)
 *   3. Auto-threaded output on completion (for memory continuity)
 *   4. Summary stored as memory (for future recall)
 */
import { getDatabase } from '@tarx/shared-db';
import type { Database as DatabaseType } from 'better-sqlite3';
import { randomUUID } from 'crypto';

const CLAUDE_CODE_SPACE_NAME = 'Claude Code Sessions';
const CLAUDE_CODE_SPACE_EMOJI = '🔧';
const CLAUDE_CODE_SPACE_DESC = 'Auto-recorded Claude Code session outputs, managed by TARX tether';

function getDb(): DatabaseType {
  return getDatabase();
}

export function ensureClaudeCodeSpace(): string {
  const database = getDb();
  const existing = database.prepare(
    `SELECT id FROM spaces WHERE name = ? AND deleted_at IS NULL`
  ).get(CLAUDE_CODE_SPACE_NAME) as { id: string } | undefined;
  if (existing) return existing.id;

  const spaceId = randomUUID();
  const now = Date.now();
  database.prepare(`
    INSERT INTO spaces (id, name, description, emoji, created_at, updated_at, last_accessed_at, message_count, total_tokens)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)
  `).run(spaceId, CLAUDE_CODE_SPACE_NAME, CLAUDE_CODE_SPACE_DESC, CLAUDE_CODE_SPACE_EMOJI, now, now, now);
  console.error(`[Tether] Created Claude Code space: ${spaceId}`);
  return spaceId;
}

export function initTetherSchema(): void {
  const database = getDb();
  database.exec(`
    CREATE TABLE IF NOT EXISTS tethered_sessions (
      cc_session_id TEXT PRIMARY KEY,
      tarx_session_id TEXT NOT NULL,
      orch_session_id TEXT NOT NULL,
      space_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      workspace TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT 'sonnet',
      output_synced INTEGER DEFAULT 0,
      output_summary TEXT,
      created_at INTEGER NOT NULL,
      last_sync_at INTEGER,
      FOREIGN KEY (tarx_session_id) REFERENCES sessions(id),
      FOREIGN KEY (space_id) REFERENCES spaces(id)
    )
  `);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_tethered_cc ON tethered_sessions(cc_session_id)`);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_tethered_tarx ON tethered_sessions(tarx_session_id)`);
  console.error('[Tether] Schema initialized');
}

export interface TetherResult {
  success: boolean;
  ccSessionId: string;
  tarxSessionId: string;
  orchSessionId: string;
  spaceId: string;
  message: string;
}

export function createTether(
  ccSessionId: string,
  prompt: string,
  workspace: string,
  model: string = 'sonnet'
): TetherResult {
  const database = getDb();
  const now = Date.now();
  const spaceId = ensureClaudeCodeSpace();
  const tarxSessionId = randomUUID();
  const title = `CC: ${prompt.substring(0, 80)}${prompt.length > 80 ? '...' : ''}`;

  database.prepare(`
    INSERT INTO sessions (id, title, space_id, model, message_count, created_at, updated_at, topic, metadata, last_activity, total_tokens, is_active)
    VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 0, 1)
  `).run(tarxSessionId, title, spaceId, model, now, now, 'claude-code-session',
    JSON.stringify({ ccSessionId, workspace, type: 'tethered' }), now);

  const promptMsgId = randomUUID();
  database.prepare(`
    INSERT INTO messages (id, session_id, role, content, metadata, created_at, model)
    VALUES (?, ?, 'user', ?, ?, ?, ?)
  `).run(promptMsgId, tarxSessionId, prompt,
    JSON.stringify({ type: 'cc_prompt', ccSessionId }), now, model);

  database.prepare(`UPDATE sessions SET message_count = 1 WHERE id = ?`).run(tarxSessionId);
  database.prepare(`UPDATE spaces SET message_count = message_count + 1, updated_at = ? WHERE id = ?`).run(now, spaceId);

  const orchSessionId = `cc-tether-${ccSessionId}`;
  try {
    database.prepare(`
      INSERT INTO orch_sessions (id, name, workspace_path, status, current_task, last_activity, created_at)
      VALUES (?, ?, ?, 'active', ?, ?, ?)
    `).run(orchSessionId, title, workspace, prompt.substring(0, 200), now, now);
  } catch (e) {
    database.prepare(`
      UPDATE orch_sessions SET status = 'active', current_task = ?, last_activity = ? WHERE id = ?
    `).run(prompt.substring(0, 200), now, orchSessionId);
  }

  database.prepare(`
    INSERT INTO tethered_sessions (cc_session_id, tarx_session_id, orch_session_id, space_id, prompt, workspace, model, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(ccSessionId, tarxSessionId, orchSessionId, spaceId, prompt, workspace, model, now);

  console.error(`[Tether] Created: CC=${ccSessionId} → TARX=${tarxSessionId}`);
  return { success: true, ccSessionId, tarxSessionId, orchSessionId, spaceId,
    message: `Tethered session created. Output auto-syncs to TARX session ${tarxSessionId}` };
}

export function syncOutput(
  ccSessionId: string,
  output: string,
  status: 'completed' | 'error',
  exitCode?: number | null
): { success: boolean; messageId?: string; memoryId?: string } {
  const database = getDb();
  const now = Date.now();

  const tether = database.prepare(
    `SELECT * FROM tethered_sessions WHERE cc_session_id = ?`
  ).get(ccSessionId) as Record<string, unknown> | undefined;
  if (!tether) return { success: false };

  const tarxSessionId = tether.tarx_session_id as string;
  const orchSessionId = tether.orch_session_id as string;
  const spaceId = tether.space_id as string;
  const prompt = tether.prompt as string;

  const msgId = randomUUID();
  const truncatedOutput = output.length > 50000 ? output.substring(0, 50000) + '\n\n[...truncated]' : output;

  database.prepare(`
    INSERT INTO messages (id, session_id, role, content, metadata, created_at, model)
    VALUES (?, ?, 'assistant', ?, ?, ?, ?)
  `).run(msgId, tarxSessionId, truncatedOutput,
    JSON.stringify({ type: 'cc_output', ccSessionId, status, exitCode, outputLength: output.length }),
    now, tether.model as string);

  const msgCount = database.prepare(
    `SELECT COUNT(*) as count FROM messages WHERE session_id = ?`
  ).get(tarxSessionId) as { count: number };
  database.prepare(`
    UPDATE sessions SET message_count = ?, updated_at = ?, last_activity = ?, is_active = 0 WHERE id = ?
  `).run(msgCount.count, now, now, tarxSessionId);
  database.prepare(`UPDATE spaces SET message_count = message_count + 1, updated_at = ? WHERE id = ?`).run(now, spaceId);

  database.prepare(`
    UPDATE orch_sessions SET status = ?, last_activity = ?, last_output = ? WHERE id = ?
  `).run(status === 'completed' ? 'completed' : 'active', now, truncatedOutput.substring(0, 2000), orchSessionId);

  try {
    database.prepare(`
      INSERT INTO orch_session_activity (session_id, timestamp, activity_type, details)
      VALUES (?, ?, ?, ?)
    `).run(orchSessionId, now, 'output_synced', JSON.stringify({ status, exitCode, outputLength: output.length }));
  } catch (e) { /* non-critical */ }

  let memoryId: string | undefined;
  if (output.length > 100) {
    memoryId = randomUUID();
    const summary = `Claude Code session (${status}): "${prompt.substring(0, 100)}..." → ${output.length} chars. Workspace: ${tether.workspace}`;
    try {
      database.prepare(`
        INSERT INTO memories (id, content, source, source_id, importance, created_at)
        VALUES (?, ?, 'claude_code', ?, ?, ?)
      `).run(memoryId, summary, ccSessionId, status === 'completed' ? 0.6 : 0.4, now);
    } catch (e) { memoryId = undefined; }
  }

  database.prepare(`
    UPDATE tethered_sessions SET output_synced = 1, last_sync_at = ?, output_summary = ? WHERE cc_session_id = ?
  `).run(now, output.substring(0, 500), ccSessionId);

  console.error(`[Tether] Synced: CC=${ccSessionId} → msg=${msgId}`);
  return { success: true, messageId: msgId, memoryId };
}

export interface TetheredSession {
  ccSessionId: string;
  tarxSessionId: string;
  orchSessionId: string;
  spaceId: string;
  prompt: string;
  workspace: string;
  model: string;
  outputSynced: boolean;
  createdAt: number;
  lastSyncAt: number | null;
}

export function listTetheredSessions(options?: { synced?: boolean; limit?: number }): TetheredSession[] {
  const database = getDb();
  let query = 'SELECT * FROM tethered_sessions';
  const params: unknown[] = [];
  if (options?.synced !== undefined) {
    query += ' WHERE output_synced = ?';
    params.push(options.synced ? 1 : 0);
  }
  query += ' ORDER BY created_at DESC';
  if (options?.limit) { query += ' LIMIT ?'; params.push(options.limit); }

  return (database.prepare(query).all(...params) as Record<string, unknown>[]).map(row => ({
    ccSessionId: row.cc_session_id as string,
    tarxSessionId: row.tarx_session_id as string,
    orchSessionId: row.orch_session_id as string,
    spaceId: row.space_id as string,
    prompt: row.prompt as string,
    workspace: row.workspace as string,
    model: row.model as string,
    outputSynced: (row.output_synced as number) === 1,
    createdAt: row.created_at as number,
    lastSyncAt: row.last_sync_at as number | null,
  }));
}

export function getTether(ccSessionId: string): TetheredSession | null {
  const database = getDb();
  const row = database.prepare(`SELECT * FROM tethered_sessions WHERE cc_session_id = ?`).get(ccSessionId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    ccSessionId: row.cc_session_id as string, tarxSessionId: row.tarx_session_id as string,
    orchSessionId: row.orch_session_id as string, spaceId: row.space_id as string,
    prompt: row.prompt as string, workspace: row.workspace as string, model: row.model as string,
    outputSynced: (row.output_synced as number) === 1, createdAt: row.created_at as number,
    lastSyncAt: row.last_sync_at as number | null,
  };
}

export function getTetherStats(): {
  totalSessions: number; syncedSessions: number; unsyncedSessions: number;
  totalOutputMessages: number; totalMemories: number; spaceId: string | null;
} {
  const database = getDb();
  const total = (database.prepare(`SELECT COUNT(*) as count FROM tethered_sessions`).get() as { count: number }).count;
  const synced = (database.prepare(`SELECT COUNT(*) as count FROM tethered_sessions WHERE output_synced = 1`).get() as { count: number }).count;
  const space = database.prepare(`SELECT id FROM spaces WHERE name = ? AND deleted_at IS NULL`).get(CLAUDE_CODE_SPACE_NAME) as { id: string } | undefined;

  let outputMessages = 0;
  if (space) {
    outputMessages = (database.prepare(`SELECT COUNT(*) as count FROM messages m JOIN sessions s ON m.session_id = s.id WHERE s.space_id = ?`).get(space.id) as { count: number }).count;
  }
  const memories = (database.prepare(`SELECT COUNT(*) as count FROM memories WHERE source = 'claude_code'`).get() as { count: number }).count;

  return { totalSessions: total, syncedSessions: synced, unsyncedSessions: total - synced, totalOutputMessages: outputMessages, totalMemories: memories, spaceId: space?.id || null };
}

initTetherSchema();
