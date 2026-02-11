/**
 * TARX Orchestration MCP - Database Schema
 *
 * Uses the shared TARX database at ~/Library/Application Support/tarx/memory.db
 * All tables are prefixed with 'orch_' to avoid conflicts.
 */

import { db as sharedDb, DB_PATH } from '@tarx/shared-db';
import type { Database as DatabaseType } from 'better-sqlite3';

// Re-export the shared database connection
// The schema is initialized by @tarx/shared-db module
const db: DatabaseType = sharedDb;

export { db, DB_PATH };
