/**
 * TARX Autonomic Daemon - Wakefulness Manager
 *
 * Keeps the machine awake for mesh compute:
 * - macOS: caffeinate -di (prevent display + idle sleep)
 * - Windows: SetThreadExecutionState
 * - Linux: systemd-inhibit or xdg-screensaver
 */

import { spawn, ChildProcess } from 'child_process';
import * as os from 'os';

export class WakefulnessManager {
  private caffeinateProcess: ChildProcess | null = null;
  private platform: string;

  constructor() {
    this.platform = os.platform();
  }

  async keepAwake(): Promise<void> {
    switch (this.platform) {
      case 'darwin':
        // macOS: use caffeinate -di (prevent display sleep and idle sleep)
        this.caffeinateProcess = spawn('caffeinate', ['-di'], {
          detached: true,
          stdio: 'ignore'
        });
        this.caffeinateProcess.unref();
        console.log('[Wakefulness] macOS: caffeinate started (display + idle sleep prevented)');
        break;

      case 'win32':
        // Windows: use PowerShell to call SetThreadExecutionState
        // ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED = 0x80000003
        spawn('powershell', [
          '-Command',
          `Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class Power { [DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags); }'; [Power]::SetThreadExecutionState(0x80000003)`
        ], {
          detached: true,
          stdio: 'ignore'
        });
        console.log('[Wakefulness] Windows: SetThreadExecutionState called');
        break;

      case 'linux':
        // Linux: try systemd-inhibit, fall back to xdg-screensaver
        try {
          this.caffeinateProcess = spawn('systemd-inhibit', [
            '--what=idle:sleep:handle-lid-switch',
            '--who=TARX Autonomic',
            '--why=Serving mesh compute and monitoring',
            'sleep', 'infinity'
          ], {
            detached: true,
            stdio: 'ignore'
          });
          this.caffeinateProcess.unref();
          console.log('[Wakefulness] Linux: systemd-inhibit started');
        } catch {
          // Fallback: xdg-screensaver
          spawn('xdg-screensaver', ['suspend', process.pid.toString()], {
            detached: true,
            stdio: 'ignore'
          });
          console.log('[Wakefulness] Linux: xdg-screensaver suspend called');
        }
        break;

      default:
        console.log(`[Wakefulness] Unsupported platform: ${this.platform}`);
    }
  }

  async allowSleep(): Promise<void> {
    if (this.caffeinateProcess) {
      this.caffeinateProcess.kill();
      this.caffeinateProcess = null;
      console.log('[Wakefulness] Sleep prevention disabled');
    }

    if (this.platform === 'win32') {
      // Reset Windows execution state
      spawn('powershell', [
        '-Command',
        `Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class Power { [DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags); }'; [Power]::SetThreadExecutionState(0x80000000)`
      ]);
    }
  }

  isKeepingAwake(): boolean {
    return this.caffeinateProcess !== null;
  }
}
