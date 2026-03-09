/**
 * TARX Autonomic Daemon - Admin API
 *
 * HTTP API for daemon control + memory + sessions:
 * - GET  /status - Daemon state
 * - POST /message - Send message to daemon
 * - POST /stop - Emergency stop
 * - POST /clear-stop - Clear emergency stop
 * - GET  /fixes - List recent fixes
 * - POST /rollback/:id - Rollback a fix
 * - POST /v1/memory - Store a key-value memory
 * - POST /v1/memory/search - Search memories
 * - GET  /v1/sessions - List sessions
 * - POST /v1/sessions - Create session
 * - GET  /v1/sessions/:id - Get session
 * - DELETE /v1/sessions/:id - Close session
 */

import * as http from 'http';
import * as path from 'path';
import * as os from 'os';

const DB_PATH = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');

let _db: any = null;

function getAdminDB(): any {
  if (_db) { return _db; }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3');
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');

    _db.exec(`CREATE TABLE IF NOT EXISTS kv_memories (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      tags TEXT,
      created_at INTEGER NOT NULL,
      ttl_days INTEGER
    )`);

    _db.exec(`CREATE TABLE IF NOT EXISTS api_sessions (
      session_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_active INTEGER NOT NULL,
      closed INTEGER DEFAULT 0
    )`);

    console.log('[AdminAPI] SQLite tables ready');
    return _db;
  } catch (err) {
    console.error('[AdminAPI] better-sqlite3 failed to load:', err);
    return null;
  }
}

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export class AdminAPI {
  private server: http.Server | null = null;
  private daemon: any; // TarxAutonomicDaemon

  constructor(daemon: any) {
    this.daemon = daemon;
  }

  async start(port: number): Promise<void> {
    this.server = http.createServer(async (req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      const url = new URL(req.url || '/', `http://localhost:${port}`);
      const pathname = url.pathname;

      try {
        // Route handling
        if (req.method === 'GET' && pathname === '/status') {
          const state = this.daemon.getState();
          this.sendJSON(res, 200, state);
        }
        else if (req.method === 'GET' && pathname === '/health') {
          this.sendJSON(res, 200, { status: 'ok', timestamp: Date.now() });
        }
        else if (req.method === 'POST' && pathname === '/message') {
          const body = await this.readBody(req);
          const { message } = JSON.parse(body);
          const result = await this.daemon.interruptWithMessage(message);
          this.sendJSON(res, 200, { result });
        }
        else if (req.method === 'POST' && pathname === '/stop') {
          this.daemon.emergencyStop();
          this.sendJSON(res, 200, { success: true, message: 'Emergency stop activated' });
        }
        else if (req.method === 'POST' && pathname === '/clear-stop') {
          this.daemon.killSwitch?.clearEmergencyStop();
          this.sendJSON(res, 200, { success: true, message: 'Emergency stop cleared' });
        }
        else if (req.method === 'GET' && pathname === '/fixes') {
          const fixes = this.daemon.auditTrail?.getRecentFixes() || [];
          this.sendJSON(res, 200, { fixes });
        }
        else if (req.method === 'POST' && pathname.startsWith('/rollback/')) {
          const fixId = pathname.replace('/rollback/', '');
          const success = this.daemon.auditTrail?.rollback(fixId) || false;
          this.sendJSON(res, success ? 200 : 400, {
            success,
            message: success ? 'Rollback complete' : 'Rollback failed'
          });
        }
        else if (req.method === 'GET' && pathname === '/reputation') {
          const stats = this.daemon.reputation?.getStats() || {};
          this.sendJSON(res, 200, stats);
        }
        else if (req.method === 'GET' && pathname === '/mesh') {
          const stats = await this.daemon.broadcaster?.getMeshStats() || {};
          this.sendJSON(res, 200, stats);
        }
        // ── Memory routes ──
        else if (req.method === 'POST' && pathname === '/v1/memory') {
          const db = getAdminDB();
          if (!db) { this.sendJSON(res, 503, { error: 'database_unavailable' }); return; }
          const body = await this.readBody(req);
          const { key, value, tags, ttl_days } = JSON.parse(body);
          if (!key || !value) { this.sendJSON(res, 400, { error: 'key and value required' }); return; }
          const id = generateId();
          const now = Date.now();
          db.prepare('INSERT INTO kv_memories (id, key, value, tags, created_at, ttl_days) VALUES (?, ?, ?, ?, ?, ?)')
            .run(id, key, value, tags ? JSON.stringify(tags) : null, now, ttl_days ?? null);
          this.sendJSON(res, 200, { stored: true, id, key, created_at: now });
        }
        else if (req.method === 'POST' && pathname === '/v1/memory/search') {
          const db = getAdminDB();
          if (!db) { this.sendJSON(res, 503, { error: 'database_unavailable' }); return; }
          const body = await this.readBody(req);
          const { query, limit, tags } = JSON.parse(body);
          const maxResults = limit ?? 10;

          // Exact key match first, then LIKE fallback
          let rows = db.prepare('SELECT * FROM kv_memories WHERE key = ? ORDER BY created_at DESC LIMIT ?')
            .all(query, maxResults);
          if (rows.length === 0) {
            rows = db.prepare('SELECT * FROM kv_memories WHERE key LIKE ? OR value LIKE ? ORDER BY created_at DESC LIMIT ?')
              .all(`%${query}%`, `%${query}%`, maxResults);
          }
          // Tag filter
          if (tags && tags.length > 0) {
            rows = rows.filter((r: any) => {
              if (!r.tags) { return false; }
              const rowTags = JSON.parse(r.tags);
              return tags.some((t: string) => rowTags.includes(t));
            });
          }
          // Parse tags back to arrays
          const results = rows.map((r: any) => ({
            ...r,
            tags: r.tags ? JSON.parse(r.tags) : [],
          }));
          this.sendJSON(res, 200, { results, count: results.length });
        }
        // ── Session routes ──
        else if (req.method === 'GET' && pathname === '/v1/sessions') {
          const db = getAdminDB();
          if (!db) { this.sendJSON(res, 503, { error: 'database_unavailable' }); return; }
          const sessions = db.prepare('SELECT * FROM api_sessions WHERE closed = 0 ORDER BY last_active DESC').all();
          this.sendJSON(res, 200, { sessions });
        }
        else if (req.method === 'POST' && pathname === '/v1/sessions') {
          const db = getAdminDB();
          if (!db) { this.sendJSON(res, 503, { error: 'database_unavailable' }); return; }
          const body = await this.readBody(req);
          const { name } = JSON.parse(body);
          const sessionId = generateId();
          const now = Date.now();
          db.prepare('INSERT INTO api_sessions (session_id, name, created_at, last_active) VALUES (?, ?, ?, ?)')
            .run(sessionId, name ?? `session-${now}`, now, now);
          this.sendJSON(res, 200, { session_id: sessionId, name: name ?? `session-${now}`, created_at: now });
        }
        else if (req.method === 'GET' && pathname.startsWith('/v1/sessions/')) {
          const db = getAdminDB();
          if (!db) { this.sendJSON(res, 503, { error: 'database_unavailable' }); return; }
          const sessionId = pathname.replace('/v1/sessions/', '');
          const session = db.prepare('SELECT * FROM api_sessions WHERE session_id = ?').get(sessionId);
          if (session) {
            db.prepare('UPDATE api_sessions SET last_active = ? WHERE session_id = ?').run(Date.now(), sessionId);
            this.sendJSON(res, 200, session);
          } else {
            this.sendJSON(res, 404, { error: 'session_not_found', session_id: sessionId });
          }
        }
        else if (req.method === 'DELETE' && pathname.startsWith('/v1/sessions/')) {
          const db = getAdminDB();
          if (!db) { this.sendJSON(res, 503, { error: 'database_unavailable' }); return; }
          const sessionId = pathname.replace('/v1/sessions/', '');
          db.prepare('UPDATE api_sessions SET closed = 1, last_active = ? WHERE session_id = ?')
            .run(Date.now(), sessionId);
          this.sendJSON(res, 200, { closed: true, session_id: sessionId });
        }
        else {
          this.sendJSON(res, 404, { error: 'Not found' });
        }
      } catch (error) {
        console.error('[AdminAPI] Request error:', error);
        this.sendJSON(res, 500, { error: String(error) });
      }
    });

    this.server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[AdminAPI] Port ${port} in use, skipping startup`);
        return;
      }
      console.error('[AdminAPI] Server error:', err.message);
    });

    this.server.listen(port, () => {
      console.log(`[AdminAPI] Running on http://localhost:${port}`);
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      this.server.close();
      this.server = null;
      console.log('[AdminAPI] Stopped');
    }
  }

  private sendJSON(res: http.ServerResponse, status: number, data: any): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }
}
