/**
 * TARX Autonomic Daemon - Kill Switch
 *
 * Global safety control that can be triggered via:
 * - Environment variable: TARX_AUTONOMIC_ENABLED=false
 * - Emergency stop file: /tmp/tarx-autonomic-emergency-stop
 * - Admin API command
 * - UI toggle
 */

import * as fs from 'fs';

export class KillSwitch {
  private enabled: boolean = false;
  private readonly EMERGENCY_STOP_FILE = '/tmp/tarx-autonomic-emergency-stop';

  constructor() {
    // Check environment variable
    this.enabled = process.env.TARX_AUTONOMIC_ENABLED !== 'false';

    // If env var allows, check for emergency stop file
    if (this.enabled && this.isEmergencyStopped()) {
      this.enabled = false;
    }

    console.log(`[KillSwitch] Initialized. Enabled: ${this.enabled}`);
  }

  isEnabled(): boolean {
    return this.enabled && !this.isEmergencyStopped();
  }

  canApply(): boolean {
    return this.isEnabled();
  }

  canBroadcast(): boolean {
    return this.isEnabled();
  }

  emergencyStop(): void {
    this.enabled = false;
    fs.writeFileSync(this.EMERGENCY_STOP_FILE, JSON.stringify({
      timestamp: Date.now(),
      reason: 'Emergency stop activated'
    }));
    console.log('[KillSwitch] 🚨 EMERGENCY STOP ACTIVATED');
  }

  private isEmergencyStopped(): boolean {
    return fs.existsSync(this.EMERGENCY_STOP_FILE);
  }

  clearEmergencyStop(): void {
    if (fs.existsSync(this.EMERGENCY_STOP_FILE)) {
      fs.unlinkSync(this.EMERGENCY_STOP_FILE);
      this.enabled = process.env.TARX_AUTONOMIC_ENABLED !== 'false';
      console.log('[KillSwitch] Emergency stop cleared');
    }
  }

  getStatus(): { enabled: boolean; emergencyStopped: boolean } {
    return {
      enabled: this.enabled,
      emergencyStopped: this.isEmergencyStopped()
    };
  }
}
