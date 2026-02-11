/**
 * TARX Autonomic Daemon - Audit Trail
 *
 * Fix history tracking and rollback:
 * - Records every fix with before/after state
 * - Keeps last 10 fixes (configurable)
 * - Auto-rollback if error reappears within 2 hours
 * - Full manifest with verification proof
 */

import * as fs from 'fs';
import * as path from 'path';

export interface FixManifest {
  id: string;
  timestamp: number;
  errorId: string;
  file: string;
  beforeHash: string;
  afterHash: string;
  broadcasterNodeId: string;
  verificationProof: any;
  rolledBack: boolean;
}

export class AuditTrail {
  private readonly FIXES_DIR: string;
  private readonly MAX_FIXES = 10;

  constructor() {
    this.FIXES_DIR = path.join(
      process.env.HOME || '~',
      '.tarx',
      'autonomic',
      'fixes'
    );

    if (!fs.existsSync(this.FIXES_DIR)) {
      fs.mkdirSync(this.FIXES_DIR, { recursive: true });
    }
  }

  record(fix: {
    errorId: string;
    file: string;
    beforeContent: string;
    afterContent: string;
    beforeHash: string;
    afterHash: string;
    nodeId: string;
    verification: any;
  }): string {
    const id = `fix-${Date.now()}-${fix.errorId.substring(0, 8)}`;

    // Save the original content as a patch file
    const patchPath = path.join(this.FIXES_DIR, `${id}.patch`);
    fs.writeFileSync(patchPath, fix.beforeContent);

    // Save manifest with metadata
    const manifest: FixManifest = {
      id,
      timestamp: Date.now(),
      errorId: fix.errorId,
      file: fix.file,
      beforeHash: fix.beforeHash,
      afterHash: fix.afterHash,
      broadcasterNodeId: fix.nodeId,
      verificationProof: fix.verification,
      rolledBack: false
    };

    const manifestPath = path.join(this.FIXES_DIR, `${id}.json`);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    console.log(`[AuditTrail] Recorded fix ${id}`);

    // Cleanup old fixes beyond MAX_FIXES
    this.cleanupOldFixes();

    return id;
  }

  rollback(fixId: string): boolean {
    const manifestPath = path.join(this.FIXES_DIR, `${fixId}.json`);
    const patchPath = path.join(this.FIXES_DIR, `${fixId}.patch`);

    if (!fs.existsSync(manifestPath) || !fs.existsSync(patchPath)) {
      console.error(`[AuditTrail] Fix ${fixId} not found`);
      return false;
    }

    try {
      const manifest: FixManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const originalContent = fs.readFileSync(patchPath, 'utf-8');

      // Restore original file
      fs.writeFileSync(manifest.file, originalContent);

      // Mark as rolled back
      manifest.rolledBack = true;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      console.log(`[AuditTrail] Rolled back fix ${fixId}`);
      return true;
    } catch (error) {
      console.error(`[AuditTrail] Rollback failed:`, error);
      return false;
    }
  }

  rollbackLast(): boolean {
    const fixes = this.getRecentFixes().filter(f => !f.rolledBack);
    if (fixes.length === 0) {
      console.log('[AuditTrail] No fixes to rollback');
      return false;
    }

    const lastFix = fixes[fixes.length - 1];
    return this.rollback(lastFix.id);
  }

  getRecentFixes(): FixManifest[] {
    try {
      const files = fs.readdirSync(this.FIXES_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const content = fs.readFileSync(path.join(this.FIXES_DIR, f), 'utf-8');
          return JSON.parse(content) as FixManifest;
        })
        .sort((a, b) => a.timestamp - b.timestamp);

      return files;
    } catch {
      return [];
    }
  }

  getFixById(fixId: string): FixManifest | null {
    const manifestPath = path.join(this.FIXES_DIR, `${fixId}.json`);
    if (!fs.existsSync(manifestPath)) {
      return null;
    }
    try {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    } catch {
      return null;
    }
  }

  async autoRollbackIfErrorReappears(fixId: string): Promise<boolean> {
    const manifestPath = path.join(this.FIXES_DIR, `${fixId}.json`);
    if (!fs.existsSync(manifestPath)) return false;

    try {
      const manifest: FixManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

      // Only check fixes from the last 2 hours
      const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
      if (manifest.timestamp < twoHoursAgo) return false;
      if (manifest.rolledBack) return false;

      // Check Sentry for recurrence
      const response = await fetch(
        `https://sentry.io/api/0/issues/${manifest.errorId}/events/?statsPeriod=2h`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.SENTRY_AUTH_TOKEN}`
          }
        }
      );

      if (!response.ok) return false;

      const events = await response.json();
      if (!Array.isArray(events)) return false;

      // Check if there are events AFTER the fix was applied
      const recentEvents = events.filter((e: any) =>
        new Date(e.dateCreated).getTime() > manifest.timestamp
      );

      if (recentEvents.length > 0) {
        console.log(`[AuditTrail] Error ${manifest.errorId} reappeared, auto-rolling back`);
        return this.rollback(fixId);
      }

      return false;
    } catch (error) {
      console.error(`[AuditTrail] Auto-rollback check failed:`, error);
      return false;
    }
  }

  private cleanupOldFixes(): void {
    const fixes = this.getRecentFixes();

    if (fixes.length > this.MAX_FIXES) {
      const toDelete = fixes.slice(0, fixes.length - this.MAX_FIXES);
      for (const fix of toDelete) {
        const patchPath = path.join(this.FIXES_DIR, `${fix.id}.patch`);
        const manifestPath = path.join(this.FIXES_DIR, `${fix.id}.json`);

        if (fs.existsSync(patchPath)) fs.unlinkSync(patchPath);
        if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);

        console.log(`[AuditTrail] Cleaned up old fix ${fix.id}`);
      }
    }
  }
}
