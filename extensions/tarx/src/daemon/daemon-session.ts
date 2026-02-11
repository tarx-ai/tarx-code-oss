/**
 * TARX Autonomic Daemon - Session Management
 *
 * Manages the daemon's conversation session:
 * - Logs to MCP space (AUTONOMIC_SPACE_ID)
 * - Checks for user interruptions
 * - Stores pending fixes for user approval
 * - Supports interactive mode
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as os from 'os';

export interface SessionMessage {
  role: 'system' | 'user' | 'assistant' | 'info' | 'warning' | 'error' | 'success';
  content: string;
  timestamp: number;
}

export class DaemonSession {
  private spaceId: string = '';
  private sessionId: string = '';
  private dbPath: string;
  private pendingFix: any = null;
  private messages: SessionMessage[] = [];

  constructor() {
    this.dbPath = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');
  }

  async initialize(spaceId: string): Promise<void> {
    this.spaceId = spaceId;
    this.sessionId = `autonomic-${Date.now()}`;

    // Create session in database
    try {
      this.queryDB(`
        INSERT OR REPLACE INTO sessions (id, space_id, title, created_at, updated_at, message_count)
        VALUES ('${this.sessionId}', '${this.spaceId}', 'Autonomic Daemon Session', ${Date.now()}, ${Date.now()}, 0);
      `);
      console.log(`[DaemonSession] Initialized session ${this.sessionId} in space ${this.spaceId}`);
    } catch (error) {
      console.error('[DaemonSession] Failed to create session:', error);
    }
  }

  async log(role: SessionMessage['role'], content: string): Promise<void> {
    const message: SessionMessage = {
      role,
      content,
      timestamp: Date.now()
    };
    this.messages.push(message);

    // Format message prefix based on role
    const prefix = this.getRolePrefix(role);
    const formattedContent = `${prefix} ${content}`;

    // Log to console
    console.log(`[DaemonSession] ${formattedContent}`);

    // Store in database
    try {
      const escapedContent = content.replace(/'/g, "''");
      this.queryDB(`
        INSERT INTO messages (id, session_id, role, content, created_at)
        VALUES ('msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}', '${this.sessionId}', '${role}', '${escapedContent}', ${Date.now()});
      `);

      // Update session message count
      this.queryDB(`
        UPDATE sessions SET message_count = message_count + 1, updated_at = ${Date.now()} WHERE id = '${this.sessionId}';
      `);
    } catch (error) {
      // Don't fail on DB errors, just log
      console.error('[DaemonSession] Failed to store message:', error);
    }
  }

  private getRolePrefix(role: SessionMessage['role']): string {
    switch (role) {
      case 'system': return '[SYS]';
      case 'user': return '[USR]';
      case 'assistant': return '[TARX]';
      case 'info': return '[INFO]';
      case 'warning': return '[WARN]';
      case 'error': return '[ERR]';
      case 'success': return '[OK]';
      default: return '[-]';
    }
  }

  async checkForUserMessage(): Promise<string | null> {
    // Check for recent user messages in the session
    try {
      const result = this.queryDB(`
        SELECT content FROM messages
        WHERE session_id = '${this.sessionId}'
          AND role = 'user'
          AND created_at > ${Date.now() - 60000}
        ORDER BY created_at DESC LIMIT 1;
      `);

      if (result && result.length > 0) {
        return result[0].content;
      }
    } catch {}

    return null;
  }

  setPendingFix(fix: any): void {
    this.pendingFix = fix;
  }

  getPendingFix(): any {
    return this.pendingFix;
  }

  clearPendingFix(): void {
    this.pendingFix = null;
  }

  getMessages(): SessionMessage[] {
    return [...this.messages];
  }

  getRecentMessages(count: number = 10): SessionMessage[] {
    return this.messages.slice(-count);
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getSpaceId(): string {
    return this.spaceId;
  }

  private queryDB(sql: string): any[] {
    try {
      const result = execSync(
        `sqlite3 -json "${this.dbPath}" "${sql.replace(/"/g, '\\"')}"`,
        { encoding: 'utf-8', timeout: 5000 }
      );
      if (result.trim()) {
        return JSON.parse(result);
      }
      return [];
    } catch (error) {
      // Check if it's just an empty result
      const err = error as any;
      if (err.status === 0 || !err.stderr?.includes('Error')) {
        return [];
      }
      throw error;
    }
  }
}
