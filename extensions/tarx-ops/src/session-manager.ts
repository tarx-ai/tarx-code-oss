/**
 * TARX Admin Session Manager
 *
 * Manages multi-session orchestration for Claude Code instances.
 * Provides session tracking, file coordination, dependency management,
 * and handoffs between parallel coding sessions.
 *
 * Database: Uses shared TARX database at ~/Library/Application Support/tarx/memory.db
 */

import { db as sharedDb, getDatabase, closeDatabase as closeSharedDb } from '@tarx/shared-db';
import type { Database as DatabaseType } from 'better-sqlite3';

// =============================================================================
// TYPES
// =============================================================================

export interface AdminSession {
  id: string;
  name: string;
  status: 'active' | 'idle' | 'blocked' | 'completed';
  currentTask: string | null;
  workingDirectory: string;
  createdAt: number;
  lastActivityAt: number;
  metadata: Record<string, unknown>;
}

export interface AdminTask {
  id: string;
  sessionId: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';
  priority: number;
  dependencies: string[];
  blockedBy: string | null;
  startedAt: number | null;
  completedAt: number | null;
  result: string | null;
  createdAt: number;
}

export interface FileLock {
  id: string;
  sessionId: string;
  filePath: string;
  lockType: 'exclusive' | 'shared';
  acquiredAt: number;
  expiresAt: number | null;
  reason: string | null;
}

export interface Dependency {
  id: string;
  fromSessionId: string;
  toSessionId: string;
  taskId: string | null;
  description: string;
  status: 'waiting' | 'satisfied' | 'failed';
  createdAt: number;
  satisfiedAt: number | null;
}

export interface Handoff {
  id: string;
  fromSessionId: string;
  toSessionId: string;
  taskDescription: string;
  context: string;
  status: 'pending' | 'accepted' | 'rejected' | 'completed';
  createdAt: number;
  acceptedAt: number | null;
  completedAt: number | null;
}

export interface ActivityLog {
  id: number;
  sessionId: string;
  action: string;
  details: string;
  timestamp: number;
}

export interface Milestone {
  id: string;
  name: string;
  description: string;
  requiredTasks: string[];
  status: 'pending' | 'in_progress' | 'completed';
  progress: number;
  createdAt: number;
  completedAt: number | null;
}

// =============================================================================
// DATABASE SETUP - Uses shared TARX database
// =============================================================================

function getDb(): DatabaseType {
  // Schema is initialized by @tarx/shared-db module
  return getDatabase();
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
}

function logActivity(sessionId: string, action: string, details: string): void {
  const database = getDb();
  database.prepare(`
    INSERT INTO admin_activity_log (session_id, action, details, timestamp)
    VALUES (?, ?, ?, ?)
  `).run(sessionId, action, details, Date.now());
}

// =============================================================================
// SESSION MANAGEMENT
// =============================================================================

export function createSession(name: string, workingDirectory: string, metadata: Record<string, unknown> = {}): AdminSession {
  const database = getDb();
  const now = Date.now();
  const id = generateId();

  database.prepare(`
    INSERT INTO admin_sessions (id, name, status, working_directory, created_at, last_activity_at, metadata)
    VALUES (?, ?, 'active', ?, ?, ?, ?)
  `).run(id, name, workingDirectory, now, now, JSON.stringify(metadata));

  logActivity(id, 'session_created', `Session "${name}" created`);

  return {
    id,
    name,
    status: 'active',
    currentTask: null,
    workingDirectory,
    createdAt: now,
    lastActivityAt: now,
    metadata
  };
}

export function getSession(sessionId: string): AdminSession | null {
  const database = getDb();
  const row = database.prepare(`
    SELECT * FROM admin_sessions WHERE id = ?
  `).get(sessionId) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    id: row.id as string,
    name: row.name as string,
    status: row.status as AdminSession['status'],
    currentTask: row.current_task as string | null,
    workingDirectory: row.working_directory as string,
    createdAt: row.created_at as number,
    lastActivityAt: row.last_activity_at as number,
    metadata: JSON.parse(row.metadata as string || '{}')
  };
}

export function listSessions(status?: string): AdminSession[] {
  const database = getDb();
  let query = 'SELECT * FROM admin_sessions';
  const params: unknown[] = [];

  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }

  query += ' ORDER BY last_activity_at DESC';

  const rows = database.prepare(query).all(...params) as Record<string, unknown>[];

  return rows.map(row => ({
    id: row.id as string,
    name: row.name as string,
    status: row.status as AdminSession['status'],
    currentTask: row.current_task as string | null,
    workingDirectory: row.working_directory as string,
    createdAt: row.created_at as number,
    lastActivityAt: row.last_activity_at as number,
    metadata: JSON.parse(row.metadata as string || '{}')
  }));
}

export function updateSessionStatus(sessionId: string, status: AdminSession['status']): boolean {
  const database = getDb();
  const result = database.prepare(`
    UPDATE admin_sessions SET status = ?, last_activity_at = ? WHERE id = ?
  `).run(status, Date.now(), sessionId);

  if (result.changes > 0) {
    logActivity(sessionId, 'status_changed', `Status changed to ${status}`);
    return true;
  }
  return false;
}

// =============================================================================
// TASK MANAGEMENT
// =============================================================================

export function assignTask(sessionId: string, description: string, priority: number = 0, dependencies: string[] = []): AdminTask {
  const database = getDb();
  const now = Date.now();
  const id = generateId();

  database.prepare(`
    INSERT INTO admin_tasks (id, session_id, description, status, priority, dependencies, created_at)
    VALUES (?, ?, ?, 'pending', ?, ?, ?)
  `).run(id, sessionId, description, priority, JSON.stringify(dependencies), now);

  // Update session's current task
  database.prepare(`
    UPDATE admin_sessions SET current_task = ?, last_activity_at = ? WHERE id = ?
  `).run(description, now, sessionId);

  logActivity(sessionId, 'task_assigned', `Task assigned: ${description}`);

  return {
    id,
    sessionId,
    description,
    status: 'pending',
    priority,
    dependencies,
    blockedBy: null,
    startedAt: null,
    completedAt: null,
    result: null,
    createdAt: now
  };
}

export function getTaskProgress(sessionId: string): { tasks: AdminTask[]; summary: { total: number; completed: number; inProgress: number; blocked: number } } {
  const database = getDb();
  const rows = database.prepare(`
    SELECT * FROM admin_tasks WHERE session_id = ? ORDER BY created_at DESC
  `).all(sessionId) as Record<string, unknown>[];

  const tasks = rows.map(row => ({
    id: row.id as string,
    sessionId: row.session_id as string,
    description: row.description as string,
    status: row.status as AdminTask['status'],
    priority: row.priority as number,
    dependencies: JSON.parse(row.dependencies as string || '[]'),
    blockedBy: row.blocked_by as string | null,
    startedAt: row.started_at as number | null,
    completedAt: row.completed_at as number | null,
    result: row.result as string | null,
    createdAt: row.created_at as number
  }));

  const summary = {
    total: tasks.length,
    completed: tasks.filter(t => t.status === 'completed').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    blocked: tasks.filter(t => t.status === 'blocked').length
  };

  return { tasks, summary };
}

export function markTaskComplete(taskId: string, result?: string): boolean {
  const database = getDb();
  const now = Date.now();

  const task = database.prepare(`SELECT session_id FROM admin_tasks WHERE id = ?`).get(taskId) as { session_id: string } | undefined;
  if (!task) return false;

  const updateResult = database.prepare(`
    UPDATE admin_tasks SET status = 'completed', completed_at = ?, result = ? WHERE id = ?
  `).run(now, result || null, taskId);

  if (updateResult.changes > 0) {
    // Update session last activity
    database.prepare(`
      UPDATE admin_sessions SET last_activity_at = ? WHERE id = ?
    `).run(now, task.session_id);

    logActivity(task.session_id, 'task_completed', `Task ${taskId} completed`);

    // Check and satisfy any dependencies waiting on this task
    database.prepare(`
      UPDATE admin_dependencies SET status = 'satisfied', satisfied_at = ? WHERE task_id = ? AND status = 'waiting'
    `).run(now, taskId);

    return true;
  }
  return false;
}

export function startTask(taskId: string): boolean {
  const database = getDb();
  const now = Date.now();

  const result = database.prepare(`
    UPDATE admin_tasks SET status = 'in_progress', started_at = ? WHERE id = ? AND status = 'pending'
  `).run(now, taskId);

  return result.changes > 0;
}

// =============================================================================
// FILE COORDINATION
// =============================================================================

export function acquireFileLock(sessionId: string, filePath: string, lockType: 'exclusive' | 'shared' = 'exclusive', reason?: string, ttlMs?: number): { success: boolean; lock?: FileLock; conflict?: FileLock } {
  const database = getDb();
  const now = Date.now();

  // Clean up expired locks
  database.prepare(`DELETE FROM admin_file_locks WHERE expires_at IS NOT NULL AND expires_at < ?`).run(now);

  // Check for existing locks
  const existing = database.prepare(`
    SELECT * FROM admin_file_locks WHERE file_path = ?
  `).get(filePath) as Record<string, unknown> | undefined;

  if (existing) {
    const existingLock: FileLock = {
      id: existing.id as string,
      sessionId: existing.session_id as string,
      filePath: existing.file_path as string,
      lockType: existing.lock_type as 'exclusive' | 'shared',
      acquiredAt: existing.acquired_at as number,
      expiresAt: existing.expires_at as number | null,
      reason: existing.reason as string | null
    };

    // If same session, allow upgrade or refresh
    if (existingLock.sessionId === sessionId) {
      const expiresAt = ttlMs ? now + ttlMs : null;
      database.prepare(`
        UPDATE admin_file_locks SET lock_type = ?, expires_at = ?, reason = ? WHERE id = ?
      `).run(lockType, expiresAt, reason || null, existingLock.id);
      existingLock.lockType = lockType;
      existingLock.expiresAt = expiresAt;
      existingLock.reason = reason || null;
      return { success: true, lock: existingLock };
    }

    // Check compatibility
    if (existingLock.lockType === 'exclusive' || lockType === 'exclusive') {
      return { success: false, conflict: existingLock };
    }

    // Shared locks are compatible
  }

  const id = generateId();
  const expiresAt = ttlMs ? now + ttlMs : null;

  try {
    database.prepare(`
      INSERT INTO admin_file_locks (id, session_id, file_path, lock_type, acquired_at, expires_at, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, sessionId, filePath, lockType, now, expiresAt, reason || null);

    logActivity(sessionId, 'file_locked', `Locked ${filePath} (${lockType})`);

    return {
      success: true,
      lock: {
        id,
        sessionId,
        filePath,
        lockType,
        acquiredAt: now,
        expiresAt,
        reason: reason || null
      }
    };
  } catch (error) {
    // Unique constraint violation
    const conflict = database.prepare(`
      SELECT * FROM admin_file_locks WHERE file_path = ?
    `).get(filePath) as Record<string, unknown>;

    return {
      success: false,
      conflict: {
        id: conflict.id as string,
        sessionId: conflict.session_id as string,
        filePath: conflict.file_path as string,
        lockType: conflict.lock_type as 'exclusive' | 'shared',
        acquiredAt: conflict.acquired_at as number,
        expiresAt: conflict.expires_at as number | null,
        reason: conflict.reason as string | null
      }
    };
  }
}

export function releaseFileLock(sessionId: string, filePath: string): boolean {
  const database = getDb();

  const result = database.prepare(`
    DELETE FROM admin_file_locks WHERE session_id = ? AND file_path = ?
  `).run(sessionId, filePath);

  if (result.changes > 0) {
    logActivity(sessionId, 'file_unlocked', `Unlocked ${filePath}`);
    return true;
  }
  return false;
}

export function getFileConflicts(): { locks: FileLock[]; conflicts: Array<{ file: string; sessions: string[] }> } {
  const database = getDb();

  const locks = database.prepare(`
    SELECT * FROM admin_file_locks ORDER BY file_path
  `).all() as Record<string, unknown>[];

  const lockList = locks.map(row => ({
    id: row.id as string,
    sessionId: row.session_id as string,
    filePath: row.file_path as string,
    lockType: row.lock_type as 'exclusive' | 'shared',
    acquiredAt: row.acquired_at as number,
    expiresAt: row.expires_at as number | null,
    reason: row.reason as string | null
  }));

  // Find files with multiple sessions interested
  const fileSessionMap = new Map<string, Set<string>>();
  for (const lock of lockList) {
    if (!fileSessionMap.has(lock.filePath)) {
      fileSessionMap.set(lock.filePath, new Set());
    }
    fileSessionMap.get(lock.filePath)!.add(lock.sessionId);
  }

  const conflicts: Array<{ file: string; sessions: string[] }> = [];
  for (const [file, sessions] of fileSessionMap) {
    if (sessions.size > 1) {
      conflicts.push({ file, sessions: Array.from(sessions) });
    }
  }

  return { locks: lockList, conflicts };
}

export function getSessionLocks(sessionId: string): FileLock[] {
  const database = getDb();

  const locks = database.prepare(`
    SELECT * FROM admin_file_locks WHERE session_id = ?
  `).all(sessionId) as Record<string, unknown>[];

  return locks.map(row => ({
    id: row.id as string,
    sessionId: row.session_id as string,
    filePath: row.file_path as string,
    lockType: row.lock_type as 'exclusive' | 'shared',
    acquiredAt: row.acquired_at as number,
    expiresAt: row.expires_at as number | null,
    reason: row.reason as string | null
  }));
}

// =============================================================================
// DEPENDENCY MANAGEMENT
// =============================================================================

export function setDependency(fromSessionId: string, toSessionId: string, description: string, taskId?: string): Dependency {
  const database = getDb();
  const now = Date.now();
  const id = generateId();

  database.prepare(`
    INSERT INTO admin_dependencies (id, from_session_id, to_session_id, task_id, description, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'waiting', ?)
  `).run(id, fromSessionId, toSessionId, taskId || null, description, now);

  logActivity(fromSessionId, 'dependency_set', `Waiting on ${toSessionId}: ${description}`);

  return {
    id,
    fromSessionId,
    toSessionId,
    taskId: taskId || null,
    description,
    status: 'waiting',
    createdAt: now,
    satisfiedAt: null
  };
}

export function satisfyDependency(dependencyId: string): boolean {
  const database = getDb();
  const now = Date.now();

  const result = database.prepare(`
    UPDATE admin_dependencies SET status = 'satisfied', satisfied_at = ? WHERE id = ? AND status = 'waiting'
  `).run(now, dependencyId);

  return result.changes > 0;
}

export function getSessionDependencies(sessionId: string): { waiting: Dependency[]; providing: Dependency[] } {
  const database = getDb();

  const waitingRows = database.prepare(`
    SELECT * FROM admin_dependencies WHERE from_session_id = ?
  `).all(sessionId) as Record<string, unknown>[];

  const providingRows = database.prepare(`
    SELECT * FROM admin_dependencies WHERE to_session_id = ?
  `).all(sessionId) as Record<string, unknown>[];

  const mapRow = (row: Record<string, unknown>): Dependency => ({
    id: row.id as string,
    fromSessionId: row.from_session_id as string,
    toSessionId: row.to_session_id as string,
    taskId: row.task_id as string | null,
    description: row.description as string,
    status: row.status as Dependency['status'],
    createdAt: row.created_at as number,
    satisfiedAt: row.satisfied_at as number | null
  });

  return {
    waiting: waitingRows.map(mapRow),
    providing: providingRows.map(mapRow)
  };
}

// =============================================================================
// HANDOFFS
// =============================================================================

export function createHandoff(fromSessionId: string, toSessionId: string, taskDescription: string, context: string): Handoff {
  const database = getDb();
  const now = Date.now();
  const id = generateId();

  database.prepare(`
    INSERT INTO admin_handoffs (id, from_session_id, to_session_id, task_description, context, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `).run(id, fromSessionId, toSessionId, taskDescription, context, now);

  logActivity(fromSessionId, 'handoff_created', `Handoff to ${toSessionId}: ${taskDescription}`);
  logActivity(toSessionId, 'handoff_received', `Handoff from ${fromSessionId}: ${taskDescription}`);

  return {
    id,
    fromSessionId,
    toSessionId,
    taskDescription,
    context,
    status: 'pending',
    createdAt: now,
    acceptedAt: null,
    completedAt: null
  };
}

export function acceptHandoff(handoffId: string, sessionId: string): boolean {
  const database = getDb();
  const now = Date.now();

  const handoff = database.prepare(`
    SELECT * FROM admin_handoffs WHERE id = ? AND to_session_id = ? AND status = 'pending'
  `).get(handoffId, sessionId) as Record<string, unknown> | undefined;

  if (!handoff) return false;

  database.prepare(`
    UPDATE admin_handoffs SET status = 'accepted', accepted_at = ? WHERE id = ?
  `).run(now, handoffId);

  logActivity(sessionId, 'handoff_accepted', `Accepted handoff ${handoffId}`);

  return true;
}

export function completeHandoff(handoffId: string): boolean {
  const database = getDb();
  const now = Date.now();

  const result = database.prepare(`
    UPDATE admin_handoffs SET status = 'completed', completed_at = ? WHERE id = ? AND status = 'accepted'
  `).run(now, handoffId);

  return result.changes > 0;
}

export function getPendingHandoffs(sessionId: string): Handoff[] {
  const database = getDb();

  const rows = database.prepare(`
    SELECT * FROM admin_handoffs WHERE to_session_id = ? AND status = 'pending' ORDER BY created_at DESC
  `).all(sessionId) as Record<string, unknown>[];

  return rows.map(row => ({
    id: row.id as string,
    fromSessionId: row.from_session_id as string,
    toSessionId: row.to_session_id as string,
    taskDescription: row.task_description as string,
    context: row.context as string,
    status: row.status as Handoff['status'],
    createdAt: row.created_at as number,
    acceptedAt: row.accepted_at as number | null,
    completedAt: row.completed_at as number | null
  }));
}

// =============================================================================
// MILESTONES
// =============================================================================

export function createMilestone(name: string, description: string, requiredTasks: string[] = []): Milestone {
  const database = getDb();
  const now = Date.now();
  const id = generateId();

  database.prepare(`
    INSERT INTO admin_milestones (id, name, description, required_tasks, status, progress, created_at)
    VALUES (?, ?, ?, ?, 'pending', 0, ?)
  `).run(id, name, description, JSON.stringify(requiredTasks), now);

  return {
    id,
    name,
    description,
    requiredTasks,
    status: 'pending',
    progress: 0,
    createdAt: now,
    completedAt: null
  };
}

export function updateMilestoneProgress(milestoneId: string): Milestone | null {
  const database = getDb();

  const milestone = database.prepare(`
    SELECT * FROM admin_milestones WHERE id = ?
  `).get(milestoneId) as Record<string, unknown> | undefined;

  if (!milestone) return null;

  const requiredTasks = JSON.parse(milestone.required_tasks as string || '[]') as string[];

  if (requiredTasks.length === 0) {
    return {
      id: milestone.id as string,
      name: milestone.name as string,
      description: milestone.description as string,
      requiredTasks,
      status: milestone.status as Milestone['status'],
      progress: milestone.progress as number,
      createdAt: milestone.created_at as number,
      completedAt: milestone.completed_at as number | null
    };
  }

  // Count completed tasks
  const placeholders = requiredTasks.map(() => '?').join(',');
  const completedCount = database.prepare(`
    SELECT COUNT(*) as count FROM admin_tasks WHERE id IN (${placeholders}) AND status = 'completed'
  `).get(...requiredTasks) as { count: number };

  const progress = completedCount.count / requiredTasks.length;
  const status = progress >= 1 ? 'completed' : progress > 0 ? 'in_progress' : 'pending';
  const now = Date.now();

  database.prepare(`
    UPDATE admin_milestones SET progress = ?, status = ?, completed_at = ? WHERE id = ?
  `).run(progress, status, status === 'completed' ? now : null, milestoneId);

  return {
    id: milestone.id as string,
    name: milestone.name as string,
    description: milestone.description as string,
    requiredTasks,
    status,
    progress,
    createdAt: milestone.created_at as number,
    completedAt: status === 'completed' ? now : null
  };
}

export function getMilestones(): Milestone[] {
  const database = getDb();

  const rows = database.prepare(`
    SELECT * FROM admin_milestones ORDER BY created_at DESC
  `).all() as Record<string, unknown>[];

  return rows.map(row => ({
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    requiredTasks: JSON.parse(row.required_tasks as string || '[]'),
    status: row.status as Milestone['status'],
    progress: row.progress as number,
    createdAt: row.created_at as number,
    completedAt: row.completed_at as number | null
  }));
}

// =============================================================================
// MONITORING
// =============================================================================

export function getDashboard(): {
  sessions: { total: number; active: number; idle: number; blocked: number };
  tasks: { total: number; completed: number; inProgress: number; blocked: number };
  locks: { total: number; conflicts: number };
  handoffs: { pending: number; active: number };
  recentActivity: ActivityLog[];
} {
  const database = getDb();

  // Session stats
  const sessionStats = database.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN status = 'idle' THEN 1 ELSE 0 END) as idle,
      SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as blocked
    FROM admin_sessions
  `).get() as { total: number; active: number; idle: number; blocked: number };

  // Task stats
  const taskStats = database.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as blocked
    FROM admin_tasks
  `).get() as { total: number; completed: number; in_progress: number; blocked: number };

  // Lock stats
  const lockStats = database.prepare(`
    SELECT COUNT(*) as total FROM admin_file_locks
  `).get() as { total: number };

  const conflicts = getFileConflicts();

  // Handoff stats
  const handoffStats = database.prepare(`
    SELECT
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as active
    FROM admin_handoffs
  `).get() as { pending: number; active: number };

  // Recent activity
  const recentActivity = database.prepare(`
    SELECT * FROM admin_activity_log ORDER BY timestamp DESC LIMIT 20
  `).all() as Record<string, unknown>[];

  return {
    sessions: {
      total: sessionStats.total,
      active: sessionStats.active || 0,
      idle: sessionStats.idle || 0,
      blocked: sessionStats.blocked || 0
    },
    tasks: {
      total: taskStats.total,
      completed: taskStats.completed || 0,
      inProgress: taskStats.in_progress || 0,
      blocked: taskStats.blocked || 0
    },
    locks: {
      total: lockStats.total,
      conflicts: conflicts.conflicts.length
    },
    handoffs: {
      pending: handoffStats.pending || 0,
      active: handoffStats.active || 0
    },
    recentActivity: recentActivity.map(row => ({
      id: row.id as number,
      sessionId: row.session_id as string,
      action: row.action as string,
      details: row.details as string,
      timestamp: row.timestamp as number
    }))
  };
}

export function getSessionLog(sessionId: string, limit: number = 50): ActivityLog[] {
  const database = getDb();

  const rows = database.prepare(`
    SELECT * FROM admin_activity_log WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?
  `).all(sessionId, limit) as Record<string, unknown>[];

  return rows.map(row => ({
    id: row.id as number,
    sessionId: row.session_id as string,
    action: row.action as string,
    details: row.details as string,
    timestamp: row.timestamp as number
  }));
}

export function getPerformanceMetrics(): {
  sessionsCreatedLast24h: number;
  tasksCompletedLast24h: number;
  avgTaskDurationMs: number;
  locksAcquiredLast24h: number;
  handoffsCompletedLast24h: number;
} {
  const database = getDb();
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

  const sessionsCreated = database.prepare(`
    SELECT COUNT(*) as count FROM admin_sessions WHERE created_at > ?
  `).get(oneDayAgo) as { count: number };

  const tasksCompleted = database.prepare(`
    SELECT COUNT(*) as count FROM admin_tasks WHERE completed_at > ?
  `).get(oneDayAgo) as { count: number };

  const avgDuration = database.prepare(`
    SELECT AVG(completed_at - started_at) as avg FROM admin_tasks
    WHERE completed_at IS NOT NULL AND started_at IS NOT NULL
  `).get() as { avg: number | null };

  const locksAcquired = database.prepare(`
    SELECT COUNT(*) as count FROM admin_activity_log
    WHERE action = 'file_locked' AND timestamp > ?
  `).get(oneDayAgo) as { count: number };

  const handoffsCompleted = database.prepare(`
    SELECT COUNT(*) as count FROM admin_handoffs WHERE completed_at > ?
  `).get(oneDayAgo) as { count: number };

  return {
    sessionsCreatedLast24h: sessionsCreated.count,
    tasksCompletedLast24h: tasksCompleted.count,
    avgTaskDurationMs: avgDuration.avg || 0,
    locksAcquiredLast24h: locksAcquired.count,
    handoffsCompletedLast24h: handoffsCompleted.count
  };
}

// =============================================================================
// CLEANUP
// =============================================================================

export function closeDatabase(): void {
  // Database is managed by @tarx/shared-db module
  // closeSharedDb(); // Don't close shared DB from here - other modules may use it
}
