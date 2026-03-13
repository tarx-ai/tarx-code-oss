/**
 * TARX Autonomic Daemon
 *
 * Always-on background process that:
 * 1. Keeps machine awake for mesh compute
 * 2. Monitors and auto-heals errors via observability
 * 3. Propagates verified fixes across mesh network
 * 4. Allows user interruption anytime
 * 5. Embodies TARX persona 24/7
 *
 * THREE MODES:
 * - IDLE: Serving mesh, keeping awake, monitoring
 * - HEALING: Detecting errors, generating fixes, verifying
 * - INTERACTIVE: User chatting into daemon session
 *
 * FIX LIFECYCLE (staged rollout):
 * DETECT → ANALYZE → PROPOSE → APPLY LOCAL → VERIFY →
 * BROADCAST AS PROPOSAL → MESH CONSENSUS → GRADUAL ROLLOUT
 *
 * SAFETY RAILS:
 * - Global kill switch (env + command + UI)
 * - 5-check verification before broadcast
 * - Ed25519 signed patches
 * - Node reputation system (min 0.4 to broadcast)
 * - Audit trail with 10-fix rollback
 * - Auto-revert if error reappears within 2 hours
 */

import { WakefulnessManager } from './wakefulness';
import { ErrorAnalyzer, ObservabilityError } from './error-analyzer';
import { FixApplicator } from './fix-applicator';
import { MeshBroadcaster } from './mesh-broadcaster';
import { DaemonSession } from './daemon-session';
import { AdminAPI } from './admin-api';
import { KillSwitch } from './kill-switch';
import { Verifier } from './verification';
import { ReputationSystem } from './reputation';
import { PatchSigner } from './patch-signer';
import { AuditTrail } from './audit-trail';

export type DaemonMode = 'IDLE' | 'HEALING' | 'INTERACTIVE';

export interface DaemonState {
  mode: DaemonMode;
  startedAt: number;
  lastPollAt: number;
  errorsAnalyzed: number;
  errorsHealed: number;
  fixesBroadcast: number;
  meshNodesReached: number;
  nodeId: string;
  reputation: number;
  killSwitchActive: boolean;
}

export class TarxAutonomicDaemon {
  private state: DaemonState;
  private wakefulness: WakefulnessManager;
  private analyzer: ErrorAnalyzer;
  private applicator: FixApplicator;
  private broadcaster: MeshBroadcaster;
  private session: DaemonSession;
  private adminApi: AdminAPI;
  public killSwitch: KillSwitch;
  private verifier: Verifier;
  public reputation: ReputationSystem;
  private signer: PatchSigner;
  public auditTrail: AuditTrail;
  private running: boolean = false;
  private seenErrorIds: Set<string> = new Set();
  private observabilityFetchFailures: number = 0;

  // Configuration
  private readonly POLL_INTERVAL_MS = 60_000; // 1 minute
  private readonly CONFIDENCE_THRESHOLD = 0.7;
  private readonly OBSERVABILITY_LOOKBACK_MINUTES = 15;
  private readonly AUTONOMIC_SPACE_ID = 'dba089be-a2f9-4ad7-8779-002cd87b99d2';

  constructor() {
    this.state = {
      mode: 'IDLE',
      startedAt: Date.now(),
      lastPollAt: 0,
      errorsAnalyzed: 0,
      errorsHealed: 0,
      fixesBroadcast: 0,
      meshNodesReached: 0,
      nodeId: '',
      reputation: 1.0,
      killSwitchActive: false
    };

    this.wakefulness = new WakefulnessManager();
    this.analyzer = new ErrorAnalyzer();
    this.applicator = new FixApplicator();
    this.broadcaster = new MeshBroadcaster();
    this.session = new DaemonSession();
    this.adminApi = new AdminAPI(this);
    this.killSwitch = new KillSwitch();
    this.verifier = new Verifier();
    this.reputation = new ReputationSystem();
    this.signer = new PatchSigner();
    this.auditTrail = new AuditTrail();
  }

  async start(): Promise<void> {
    console.log('[TARX Autonomic] Starting daemon...');

    // Check kill switch first
    if (!this.killSwitch.isEnabled()) {
      console.log('[TARX Autonomic] Kill switch is OFF. Running in observe-only mode.');
      this.state.killSwitchActive = true;
    }

    this.running = true;

    // Initialize components
    this.state.nodeId = await this.signer.initialize();
    await this.reputation.initialize(this.state.nodeId);
    this.state.reputation = this.reputation.getScore();

    await this.wakefulness.keepAwake();
    await this.session.initialize(this.AUTONOMIC_SPACE_ID);
    await this.adminApi.start(11440); // Admin API port (11439 reserved for test harness)

    // Announce startup
    await this.session.log('system',
      `TARX Autonomic online. Node ID: ${this.state.nodeId.substring(0, 8)}... ` +
      `Reputation: ${this.state.reputation.toFixed(2)}. ` +
      `Mode: ${this.state.killSwitchActive ? 'OBSERVE ONLY' : 'FULL AUTONOMIC'}. ` +
      `Ready to heal.`
    );

    // Main loop
    this.runLoop();
  }

  async stop(): Promise<void> {
    console.log('[TARX Autonomic] Stopping daemon...');
    this.running = false;
    await this.wakefulness.allowSleep();
    await this.adminApi.stop();
    await this.session.log('system', 'TARX Autonomic stopped.');
  }

  private async runLoop(): Promise<void> {
    while (this.running) {
      try {
        this.state.lastPollAt = Date.now();

        // Check for user interruption first
        const userMessage = await this.session.checkForUserMessage();
        if (userMessage) {
          await this.handleUserInterruption(userMessage);
          continue;
        }

        // Check for auto-rollbacks needed
        await this.checkAutoRollbacks();

        // Poll and heal
        this.state.mode = 'HEALING';
        await this.pollAndHeal();
        this.state.mode = 'IDLE';

        // Update reputation in state
        this.state.reputation = this.reputation.getScore();

        // Sleep
        await this.sleep(this.POLL_INTERVAL_MS);

      } catch (error) {
        console.error('[TARX Autonomic] Loop error:', error);
        await this.session.log('error', `Loop error: ${error}`);
        await this.sleep(10_000); // Retry faster on error
      }
    }
  }

  private async pollAndHeal(): Promise<void> {
    // 1. Fetch recent observability errors
    const errors = await this.fetchObservabilityErrors();

    for (const error of errors) {
      // Skip already seen
      if (this.seenErrorIds.has(error.id)) continue;
      this.seenErrorIds.add(error.id);
      this.state.errorsAnalyzed++;

      // 2. Analyze with local Qwen
      await this.session.log('info', `Analyzing: ${error.title}`);
      const analysis = await this.analyzer.analyze(error);

      if (analysis.confidence < this.CONFIDENCE_THRESHOLD) {
        await this.session.log('info',
          `Low confidence (${analysis.confidence.toFixed(2)}) for "${error.title}", logging only.`
        );
        continue;
      }

      // 3. PROPOSE - Log the proposed fix (always do this, even if kill switch is on)
      await this.session.log('info',
        `Proposed fix for "${error.title}":\n` +
        `  File: ${analysis.fix.file}\n` +
        `  Summary: ${analysis.fix.summary}\n` +
        `  Confidence: ${analysis.confidence.toFixed(2)}`
      );

      // If kill switch is on, stop here (observe only)
      if (!this.killSwitch.canApply()) {
        await this.session.log('info', 'Kill switch active - not applying fix.');
        continue;
      }

      // 4. APPLY LOCAL
      const beforeHash = this.verifier.hashFile(analysis.fix.file);
      const applied = await this.applicator.apply(analysis.fix);

      if (!applied.success) {
        await this.session.log('warning',
          `Failed to apply fix for "${error.title}": ${applied.error}`
        );
        continue;
      }

      const afterHash = this.verifier.hashFile(analysis.fix.file);

      // Record in audit trail
      const fixId = this.auditTrail.record({
        errorId: error.id,
        file: analysis.fix.file,
        beforeContent: applied.backupContent || '',
        afterContent: '', // We could read it but not strictly needed
        beforeHash,
        afterHash,
        nodeId: this.state.nodeId,
        verification: { pending: true }
      });

      await this.session.log('info',
        `Applied fix locally. Audit ID: ${fixId}. Starting 5-minute verification...`
      );

      // 5. VERIFY (5 checks)
      const verification = await this.verifier.verify({
        file: analysis.fix.file,
        errorId: error.id,
        expectedHash: afterHash
      });

      if (!verification.passed) {
        await this.session.log('warning',
          `Verification FAILED for "${error.title}":\n` +
          verification.details.map(d => `  - ${d}`).join('\n') +
          `\nRolling back...`
        );
        await this.applicator.rollback(applied.backupPath!);
        await this.reputation.recordFailure();
        continue;
      }

      // 6. SUCCESS - Log and prepare broadcast
      this.state.errorsHealed++;
      await this.reputation.recordSuccess();

      await this.session.log('success',
        `Auto-healed: "${error.title}"\n` +
        `  Fix: ${analysis.fix.summary}\n` +
        `  Verification: All 5 checks passed\n` +
        `  Reputation: ${this.reputation.getScore().toFixed(2)}`
      );

      // 7. BROADCAST (if reputation allows)
      if (!this.killSwitch.canBroadcast()) {
        await this.session.log('info', 'Kill switch active - not broadcasting.');
        continue;
      }

      if (!this.reputation.canBroadcast()) {
        await this.session.log('warning',
          `Reputation too low (${this.reputation.getScore().toFixed(2)}) to broadcast. Need >= 0.4`
        );
        continue;
      }

      // Sign and broadcast
      const signature = this.signer.sign(JSON.stringify(analysis.fix));
      const broadcast = await this.broadcaster.broadcast({
        ...analysis.fix,
        errorId: error.id,
        signature,
        publicKey: this.signer.getPublicKeyPem(),
        nodeId: this.state.nodeId,
        verification: verification.checks
      });

      this.state.fixesBroadcast++;
      this.state.meshNodesReached += broadcast.nodesReached;

      await this.session.log('info',
        `Broadcast fix to mesh: ${broadcast.nodesReached} nodes received (as proposal, not auto-apply)`
      );
    }
  }

  private async handleUserInterruption(message: string): Promise<void> {
    this.state.mode = 'INTERACTIVE';
    await this.session.log('user', message);

    // Check for special commands
    if (message.toLowerCase() === 'status') {
      const status = this.getStatusSummary();
      await this.session.log('assistant', status);
      return;
    }

    if (message.toLowerCase() === 'rollback last') {
      const success = this.auditTrail.rollbackLast();
      await this.session.log('assistant',
        success ? 'Rolled back last fix.' : 'No fixes to rollback.'
      );
      return;
    }

    // Use local Qwen to respond in TARX persona
    const response = await this.analyzer.respondAsPersona(message, this.state);
    await this.session.log('assistant', response);

    // Check if user is reporting an issue
    if (this.looksLikeErrorReport(message)) {
      await this.session.log('system', 'Detected error report, analyzing...');
      const analysis = await this.analyzer.analyzeUserReport(message);
      if (analysis.hasFix) {
        await this.session.log('assistant',
          `I found a potential fix:\n\n` +
          `File: ${analysis.fix!.file}\n` +
          `Change: ${analysis.fix!.summary}\n\n` +
          `Reply "apply" to proceed, or "skip" to ignore.`
        );
        // Store pending fix for next user message
        this.session.setPendingFix(analysis.fix!);
      }
    }
  }

  private async checkAutoRollbacks(): Promise<void> {
    const recentFixes = this.auditTrail.getRecentFixes();
    for (const fix of recentFixes) {
      if (fix.rolledBack) continue;
      const rolledBack = await this.auditTrail.autoRollbackIfErrorReappears(fix.id);
      if (rolledBack) {
        await this.session.log('warning',
          `Auto-rolled back fix ${fix.id} - error ${fix.errorId} reappeared`
        );
        await this.reputation.recordFailure();
      }
    }
  }

  private getStatusSummary(): string {
    const uptimeMin = Math.floor((Date.now() - this.state.startedAt) / 60000);
    return (
      `TARX Autonomic Status\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `Mode: ${this.state.mode}\n` +
      `Uptime: ${uptimeMin} minutes\n` +
      `Node ID: ${this.state.nodeId.substring(0, 8)}...\n` +
      `Reputation: ${this.state.reputation.toFixed(2)}\n` +
      `Kill switch: ${this.state.killSwitchActive ? 'ACTIVE (observe only)' : 'OFF (full autonomic)'}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `Errors analyzed: ${this.state.errorsAnalyzed}\n` +
      `Errors healed: ${this.state.errorsHealed}\n` +
      `Fixes broadcast: ${this.state.fixesBroadcast}\n` +
      `Mesh nodes reached: ${this.state.meshNodesReached}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `Commands: "status", "rollback last"`
    );
  }

  private looksLikeErrorReport(message: string): boolean {
    const errorKeywords = ['error', 'bug', 'broken', 'not working', 'crash', 'fail', 'issue', 'problem'];
    return errorKeywords.some(kw => message.toLowerCase().includes(kw));
  }

  private async fetchObservabilityErrors(): Promise<ObservabilityError[]> {
    // TODO: Wire to Datadog MCP for error monitoring
    return [];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Public API for admin dashboard
  getState(): DaemonState {
    return { ...this.state };
  }

  async interruptWithMessage(message: string): Promise<string> {
    await this.handleUserInterruption(message);
    return 'Message received';
  }

  emergencyStop(): void {
    this.killSwitch.emergencyStop();
    this.state.killSwitchActive = true;
    this.session.log('system', '🚨 EMERGENCY STOP ACTIVATED - observe only mode');
  }
}

// Singleton instance
let daemonInstance: TarxAutonomicDaemon | null = null;

export function getDaemon(): TarxAutonomicDaemon {
  if (!daemonInstance) {
    daemonInstance = new TarxAutonomicDaemon();
  }
  return daemonInstance;
}

export async function startDaemon(): Promise<void> {
  const daemon = getDaemon();
  await daemon.start();
}

export async function stopDaemon(): Promise<void> {
  if (daemonInstance) {
    await daemonInstance.stop();
  }
}

// Export all components for external use
export { WakefulnessManager } from './wakefulness';
export { ErrorAnalyzer, ObservabilityError } from './error-analyzer';
export { FixApplicator } from './fix-applicator';
export { MeshBroadcaster } from './mesh-broadcaster';
export { DaemonSession } from './daemon-session';
export { AdminAPI } from './admin-api';
export { KillSwitch } from './kill-switch';
export { Verifier } from './verification';
export { ReputationSystem } from './reputation';
export { PatchSigner } from './patch-signer';
export { AuditTrail } from './audit-trail';
