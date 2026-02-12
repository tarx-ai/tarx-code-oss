# TARX OS Integration Specification

**Version:** 1.0
**Date:** February 12, 2026
**Author:** Claude Code (Opus 4.5)
**Status:** Design Complete — Ready for Implementation

---

## Overview

TARX is designed to be an OS-native AI agent that earns user trust progressively. Unlike cloud-first AI assistants, TARX's local-first architecture enables deeper OS integration because user data never leaves the device. This specification defines the complete OS integration strategy across macOS, Windows, and Linux.

---

## 1. Progressive Permission Model

TARX must **earn trust**. Never ask for everything upfront.

### Tier 0: Zero Permissions (First Launch)
**Trigger:** App install, no user action required

| Feature | Available | Notes |
|---------|-----------|-------|
| Chat | Yes | Local inference, no network |
| RAG search | Yes | Within TARX workspace only |
| File operations | TARX folder only | `~/.tarx-code/` |
| Notifications | No | Silent operation |
| Clipboard | No | No access |

**User Experience:**
```
TARX works immediately out of the box.
No permission dialogs on first launch.
User can chat and get help without granting any access.
```

### Tier 1: Basic (After 3+ Sessions)
**Trigger:** System prompt after user has demonstrated engagement
**Prompt:** "TARX can be more helpful with access to your files. Allow?"

| Feature | Available | Notes |
|---------|-----------|-------|
| File read | ~/Documents, ~/Desktop, ~/Downloads | Read-only |
| Clipboard read | Yes | Paste context into chat |
| Basic notifications | Yes | "Task complete", errors only |
| Session count | Tracked | For trust progression |

**Consent Dialog:**
```
┌─────────────────────────────────────────────┐
│ TARX would like to read your files          │
├─────────────────────────────────────────────┤
│ This enables:                               │
│ • Reading Documents, Desktop, and Downloads │
│ • Pasting context from your clipboard       │
│ • Notifying you when tasks complete         │
│                                             │
│ Your data stays on this device.             │
│ TARX never sends files to the cloud.        │
│                                             │
│ [Allow]  [Not Now]  [Never Ask Again]       │
└─────────────────────────────────────────────┘
```

### Tier 2: Productive (User-Initiated)
**Trigger:** User clicks "Enable Advanced Features" in settings
**Prompt:** "Enable TARX to watch your files and suggest improvements?"

| Feature | Available | Notes |
|---------|-----------|-------|
| File write | Project directories | User-approved paths |
| File watcher | Project directories | Auto-index into RAG |
| Rich notifications | Yes | Action buttons, quick replies |
| System tray | Yes | Health indicator, quick chat |
| Global shortcut | Yes | Cmd+Shift+T → floating chat |
| Context menu | Yes | "Ask TARX about this" |

**New Capabilities:**
- Auto-index new/changed files in project
- Rich notifications: "I noticed you saved a .env file — want me to add it to .gitignore?"
- System tray with quick actions
- Global hotkey for instant access

### Tier 3: Proactive (Power User Opt-In)
**Trigger:** Explicit toggle in advanced settings
**Prompt:** "Let TARX work in the background and proactively help?"

| Feature | Available | Notes |
|---------|-----------|-------|
| Background indexing | Yes | Filesystem RAG when idle |
| Calendar integration | Yes | Via system APIs |
| App-aware context | Yes | Know which app is focused |
| Proactive suggestions | Yes | Non-intrusive nudges |
| Screenshot analysis | Yes | User-initiated only |
| Auto-start on login | Yes | Start minimized to tray |

**Proactive Behaviors:**
```typescript
// When user saves a file
onFileSaved('.env') → suggest gitignore
onFileSaved('large.csv') → suggest compression
onFileSaved('*.ts') → quick lint check

// When user downloads something
onNewDownload('*.pdf') → offer to summarize
onNewDownload('*.zip') → offer to index project

// When user is idle (5+ minutes)
onIdle() → background indexing, mesh sync
```

### Tier 4: Full Agent (Explicit Per-Action)
**Trigger:** Per-action approval required
**Prompt:** Individual consent for each new capability

| Feature | Available | Notes |
|---------|-----------|-------|
| Shell commands | With preview | User approves each command |
| App automation | AppleScript/PowerShell | Per-action consent |
| Browser integration | Via extension | Explicit install |
| Email access | OAuth flow | Per-provider consent |
| API calls | Per-endpoint | User sees destination |

**Per-Action Approval:**
```
┌─────────────────────────────────────────────┐
│ TARX wants to run a command                 │
├─────────────────────────────────────────────┤
│ Command:                                    │
│   npm install express                       │
│                                             │
│ This will:                                  │
│ • Download ~50MB of packages                │
│ • Modify package.json and package-lock.json │
│                                             │
│ [Run]  [Edit Command]  [Cancel]             │
│ □ Trust this type of action for this        │
│   project                                   │
└─────────────────────────────────────────────┘
```

---

## 2. macOS Deep Integration

### 2.1 System Tray / Menu Bar

**Appearance:**
- 16x16 template icon (TARX logo, monochrome)
- Status indicator: green dot (healthy), yellow (degraded), red (down)
- Click → context menu
- Cmd+Click → quick chat popup

**Menu Items:**
```
┌────────────────────────────────┐
│ Quick Chat (⌘⇧T)               │
├────────────────────────────────┤
│ ● Status: All Systems Healthy  │
│   Inference: localhost:11435   │
│   Embeddings: localhost:11437  │
│   Mesh: 0 peers                │
├────────────────────────────────┤
│ Open TARX Workbench            │
│ Recent Projects             ▶ │
├────────────────────────────────┤
│ Settings...                    │
│ Check for Updates...           │
├────────────────────────────────┤
│ Quit TARX                      │
└────────────────────────────────┘
```

### 2.2 Global Shortcut

**Default:** Cmd+Shift+T
**Behavior:**
1. If TARX window visible → hide
2. If TARX window hidden → show + focus chat input
3. Quick chat mode: Type query → get answer → Esc to dismiss
4. "Expand" button opens full app

**Implementation:**
```typescript
globalShortcut.register('CommandOrControl+Shift+T', () => {
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('tarx:focus-chat');
  }
});
```

### 2.3 Notifications

**Types:**
| Type | Example | Actions |
|------|---------|---------|
| Task Complete | "Your build finished successfully" | [Open], [Dismiss] |
| Error | "Inference server crashed" | [Restart], [Details] |
| Suggestion | "New .env file detected" | [Add to .gitignore], [Ignore] |
| Update | "TARX v1.2 available" | [Update], [Later] |

**Rate Limit:** Max 3 notifications per hour (unless critical)

**Implementation:**
```typescript
const notification = new Notification({
  title: 'TARX: Build Complete',
  body: 'Your project built successfully in 2.3s',
  icon: 'assets/tarx-icon.png',
  actions: [
    { type: 'button', text: 'Open Output' },
    { type: 'button', text: 'Dismiss' }
  ]
});
notification.on('action', (event, index) => {
  if (index === 0) openOutput();
});
notification.show();
```

### 2.4 Finder Integration

**Context Menu (Tier 2+):**
```
Right-click any file/folder →
┌────────────────────────────────┐
│ Quick Look                     │
│ Open With                   ▶ │
├────────────────────────────────┤
│ Ask TARX about this            │ ← TARX option
│ Index with TARX                │
├────────────────────────────────┤
│ Copy                           │
│ ...                            │
└────────────────────────────────┘
```

**Quick Action:**
- Finder Services menu integration
- "Ask TARX" appears for text files
- Drag-drop onto tray icon → auto-index

### 2.5 Spotlight / Alfred Integration (Future)

**mdimporter plugin:**
- Index TARX-processed files
- Spotlight shows "Ask TARX:" results
- Deep link: `tarx-code://ask?q=<query>`

### 2.6 Login Items

**Auto-start (Tier 3+):**
- Registered as Login Item via LSSharedFileListInsertItemURL
- Starts minimized to tray
- Background indexing begins
- User can disable in System Preferences → Users & Groups → Login Items

---

## 3. Windows Deep Integration

### 3.1 System Tray

**Appearance:**
- Notification area icon with status overlay
- Same health indicator as macOS
- Right-click → context menu
- Left-click → quick chat

### 3.2 Global Shortcut

**Default:** Win+Shift+T
**Conflicts:** Check for existing bindings, offer alternatives

### 3.3 Notifications

**Toast Notifications:**
```xml
<toast>
  <visual>
    <binding template="ToastGeneric">
      <text>TARX: Build Complete</text>
      <text>Your project built successfully</text>
    </binding>
  </visual>
  <actions>
    <action content="Open" arguments="open-output"/>
    <action content="Dismiss" arguments="dismiss"/>
  </actions>
</toast>
```

### 3.4 Explorer Integration

**Context Menu:**
```
Right-click file →
┌────────────────────────────────┐
│ Open                           │
│ Open with...                   │
├────────────────────────────────┤
│ Ask TARX about this            │ ← Shell extension
│ Index with TARX                │
├────────────────────────────────┤
│ Cut                            │
│ ...                            │
└────────────────────────────────┘
```

**Registry entries:**
```
HKCR\*\shell\TARXAsk
HKCR\Directory\shell\TARXIndex
```

### 3.5 Task Scheduler

**Auto-start:**
- Task Scheduler entry (not Startup folder)
- Runs minimized
- Trigger: user logon

### 3.6 Windows Search (Future)

**IFilter implementation:**
- TARX-indexed content appears in Windows Search
- Deep link via URL protocol

---

## 4. Cross-Platform Architecture

### 4.1 Background Services

```typescript
export class TarxBackgroundService {
  private healthInterval: NodeJS.Timeout | null = null;
  private fileWatcher: fs.FSWatcher | null = null;

  async start(): Promise<void> {
    // 1. Ensure inference running
    await this.ensureInferenceRunning();

    // 2. Ensure embeddings running
    await this.ensureEmbeddingsRunning();

    // 3. Start file watcher (Tier 2+)
    if (this.permissions.has('fileWatch')) {
      this.startFileWatcher();
    }

    // 4. Health monitor (every 30s)
    this.healthInterval = setInterval(() => this.healthCheck(), 30000);

    // 5. Mesh network (if enabled)
    if (this.permissions.has('meshNetwork')) {
      await this.startMeshDiscovery();
    }
  }

  private async healthCheck(): Promise<void> {
    const inference = await fetch('http://localhost:11435/health').catch(() => null);
    const embeddings = await fetch('http://localhost:11437/health').catch(() => null);

    if (!inference) await this.restartInference();
    if (!embeddings) await this.restartEmbeddings();

    this.updateTrayStatus(inference && embeddings ? 'healthy' : 'degraded');
  }

  dispose(): void {
    if (this.healthInterval) clearInterval(this.healthInterval);
    if (this.fileWatcher) this.fileWatcher.close();
  }
}
```

### 4.2 Permission Storage

```typescript
interface TarxPermissions {
  tier: 0 | 1 | 2 | 3 | 4;
  fileSystemRead: string[];      // Allowed read paths
  fileSystemWrite: string[];     // Allowed write paths
  notifications: boolean;
  clipboard: boolean;
  globalShortcut: boolean;
  backgroundIndex: boolean;
  autoStart: boolean;
  shellExecution: boolean;       // Tier 4, per-command
  appAutomation: boolean;        // Tier 4, per-action
  grantedAt: Record<string, Date>;
  deniedPermissions: string[];   // "Never Ask Again" list
  sessionCount: number;
}

// Storage location
// macOS: ~/Library/Application Support/tarx-code/permissions.json
// Windows: %APPDATA%\tarx-code\permissions.json
// Linux: ~/.config/tarx-code/permissions.json
```

### 4.3 Consent Dialog Component

```typescript
interface ConsentDialogOptions {
  permission: string;
  reason: string;
  whatItEnables: string[];
  tier: number;
  showNeverAskAgain?: boolean;
}

export class TarxConsentDialog {
  static async requestPermission(options: ConsentDialogOptions): Promise<'allow' | 'deny' | 'never'> {
    // Use native dialog for trust
    const result = await dialog.showMessageBox({
      type: 'question',
      title: 'TARX Permission Request',
      message: `TARX would like to ${options.reason}`,
      detail: `This enables:\n${options.whatItEnables.map(e => `• ${e}`).join('\n')}\n\nYour data stays on this device.`,
      buttons: ['Allow', 'Not Now', ...(options.showNeverAskAgain ? ['Never Ask Again'] : [])],
      defaultId: 0,
      cancelId: 1,
      icon: 'assets/tarx-icon.png'
    });

    const choices: Array<'allow' | 'deny' | 'never'> = ['allow', 'deny', 'never'];
    const decision = choices[result.response];

    // Log for analytics (anonymized)
    await this.logConsentDecision(options.permission, decision);

    return decision;
  }
}
```

### 4.4 Proactive Suggestion Engine

```typescript
export class TarxProactiveEngine {
  // Only active at Tier 3+

  async onFileSaved(filepath: string): Promise<void> {
    const filename = path.basename(filepath);
    const ext = path.extname(filepath).toLowerCase();

    // .env file → suggest gitignore
    if (filename === '.env' || filename.startsWith('.env.')) {
      const gitignore = path.join(path.dirname(filepath), '.gitignore');
      if (fs.existsSync(gitignore)) {
        const content = fs.readFileSync(gitignore, 'utf8');
        if (!content.includes('.env')) {
          await this.showSuggestion({
            title: 'Protect your secrets',
            body: `Add ${filename} to .gitignore?`,
            actions: [
              { label: 'Add', callback: () => this.addToGitignore(filepath) },
              { label: 'Ignore', callback: () => this.dismissSuggestion() }
            ]
          });
        }
      }
    }

    // Large file → suggest compression
    const stats = fs.statSync(filepath);
    if (stats.size > 10 * 1024 * 1024) { // > 10MB
      await this.showSuggestion({
        title: 'Large file detected',
        body: `${filename} is ${this.formatSize(stats.size)}. Compress?`,
        actions: [
          { label: 'Compress', callback: () => this.compressFile(filepath) },
          { label: 'Ignore', callback: () => this.dismissSuggestion() }
        ]
      });
    }
  }

  async onNewDownload(filepath: string): Promise<void> {
    const ext = path.extname(filepath).toLowerCase();

    if (ext === '.pdf') {
      await this.showSuggestion({
        title: 'New PDF downloaded',
        body: 'Want me to read and summarize this?',
        actions: [
          { label: 'Summarize', callback: () => this.summarizePDF(filepath) },
          { label: 'Index', callback: () => this.indexFile(filepath) },
          { label: 'Ignore', callback: () => this.dismissSuggestion() }
        ]
      });
    }
  }

  async onIdleDetected(): Promise<void> {
    // User hasn't typed in 5+ minutes
    // Background tasks that don't interrupt
    await this.indexNewFiles();
    await this.optimizeRAG();
    await this.meshSync();
    // Don't notify unless something important found
  }

  async onAppSwitch(fromApp: string, toApp: string): Promise<void> {
    // Adjust context based on active app
    if (toApp.includes('Terminal')) {
      this.prepareCliContext();
    } else if (toApp.includes('Safari') || toApp.includes('Chrome')) {
      this.prepareResearchContext();
    } else if (toApp.includes('Figma')) {
      this.prepareDesignContext();
    }
  }
}
```

---

## 5. Anti-Patterns (What TARX Must Never Do)

### Security
- ❌ Never access files without user permission for that path
- ❌ Never run shell commands at Tier < 4 without explicit approval
- ❌ Never send data off-device without clear consent
- ❌ Never store passwords/API keys in plaintext (use OS keychain)

### User Experience
- ❌ Never show notifications before user enables them
- ❌ Never auto-start before user opts in
- ❌ Never read clipboard without Tier 1+ permission
- ❌ Never be annoying — max 3 notifications per hour
- ❌ Never interrupt user flow with modal dialogs (prefer non-modal)

### System Integrity
- ❌ Never modify OS settings without per-action approval
- ❌ Never install browser extensions without explicit consent
- ❌ Never access other applications' data without integration
- ❌ Never feel like malware — every action explainable and revocable

### Uninstall
- ❌ Never persist after uninstall:
  - Remove all data from `~/.tarx-code/`
  - Remove login items
  - Remove context menu entries
  - Remove scheduled tasks
  - Clear from OS keychain

---

## 6. Implementation Priority

### Phase 1: V1.2 (Foundation)
| Task | Effort | Impact | Files |
|------|--------|--------|-------|
| System tray | 2 days | High | tarxTray.ts |
| Global shortcut | 1 day | High | tarxGlobalShortcut.ts |
| Basic notifications | 1 day | Medium | tarxNotifications.ts |
| Permission manager | 2 days | Critical | tarxPermissions.ts |

### Phase 2: V1.3 (Integration)
| Task | Effort | Impact | Files |
|------|--------|--------|-------|
| File watcher | 3 days | High | tarxFileWatcher.ts |
| Rich notifications | 1 day | Medium | tarxNotifications.ts |
| macOS context menu | 2 days | Medium | Finder extension |
| Windows context menu | 2 days | Medium | Shell extension |
| Auto-start on login | 1 day | Medium | platform-specific |

### Phase 3: V2.0 (Proactive)
| Task | Effort | Impact | Files |
|------|--------|--------|-------|
| Proactive engine | 1 week | High | tarxProactive.ts |
| App-aware context | 3 days | Medium | tarxAppAwareness.ts |
| Idle-time processing | 2 days | Medium | tarxBackgroundService.ts |
| CLI `tarx` command | 2 days | Medium | tarx-cli/ |

### Phase 4: V3.0 (Agent)
| Task | Effort | Impact | Files |
|------|--------|--------|-------|
| Full agent mode | 2 weeks | High | tarxAgent.ts |
| Per-action approval | 1 week | Critical | tarxApproval.ts |
| Browser extension | 1 week | Medium | tarx-browser/ |
| Voice hotword | 2 weeks | Medium | tarxVoice.ts |

---

## 7. Testing Strategy

### Permission Flow Tests
```typescript
describe('TarxPermissions', () => {
  it('starts at Tier 0 with no permissions', async () => {
    const pm = new TarxPermissionManager();
    expect(pm.tier).toBe(0);
    expect(pm.hasPermission('clipboard')).toBe(false);
  });

  it('prompts for Tier 1 after 3 sessions', async () => {
    const pm = new TarxPermissionManager();
    pm.incrementSession();
    pm.incrementSession();
    pm.incrementSession();
    expect(pm.shouldPromptForTier(1)).toBe(true);
  });

  it('respects "Never Ask Again"', async () => {
    const pm = new TarxPermissionManager();
    await pm.denyPermission('clipboard', true); // never ask
    expect(pm.shouldPrompt('clipboard')).toBe(false);
  });
});
```

### System Tray Tests
```typescript
describe('TarxSystemTray', () => {
  it('shows healthy status when services up', async () => {
    // Mock healthy services
    const tray = new TarxSystemTray();
    await tray.updateStatus();
    expect(tray.getIcon()).toContain('healthy');
  });

  it('shows degraded status when inference down', async () => {
    // Mock inference down
    const tray = new TarxSystemTray();
    await tray.updateStatus();
    expect(tray.getIcon()).toContain('degraded');
  });
});
```

### Integration Tests
```typescript
describe('Global Shortcut', () => {
  it('toggles window visibility', async () => {
    // Test Cmd+Shift+T behavior
  });

  it('focuses chat input when showing window', async () => {
    // Test focus behavior
  });
});
```

---

## 8. Security Considerations

### Sandboxing
- Use Electron's sandbox mode for renderer processes
- Consider macOS seatbelt for CLI operations (Tier 4)
- Limit network access to localhost and approved endpoints

### Keychain Integration
```typescript
// macOS Keychain
import { safeStorage } from 'electron';

async function storeSecret(key: string, value: string): Promise<void> {
  const encrypted = safeStorage.encryptString(value);
  await fs.promises.writeFile(`secrets/${key}`, encrypted);
}

async function retrieveSecret(key: string): Promise<string> {
  const encrypted = await fs.promises.readFile(`secrets/${key}`);
  return safeStorage.decryptString(encrypted);
}
```

### Audit Logging
```typescript
interface AuditLog {
  timestamp: Date;
  action: string;
  permission: string;
  tier: number;
  result: 'allowed' | 'denied' | 'pending';
  details?: Record<string, unknown>;
}

// Log all permission-sensitive actions
// Stored locally, never sent to cloud
// User can export/review/delete
```

---

## Appendix A: File Locations

| Platform | Data | Logs | Config |
|----------|------|------|--------|
| macOS | ~/Library/Application Support/tarx-code | ~/Library/Logs/tarx-code | ~/.tarx-code |
| Windows | %APPDATA%\tarx-code | %APPDATA%\tarx-code\logs | %USERPROFILE%\.tarx-code |
| Linux | ~/.local/share/tarx-code | ~/.local/share/tarx-code/logs | ~/.config/tarx-code |

## Appendix B: URL Protocol

**Scheme:** `tarx-code://`

| URL | Action |
|-----|--------|
| `tarx-code://open?path=/foo/bar` | Open file in editor |
| `tarx-code://ask?q=how%20do%20I` | Open chat with query |
| `tarx-code://settings` | Open settings |
| `tarx-code://memory?search=foo` | Search TARX memory |

## Appendix C: Notification Categories

| Category | Sound | Badge | Alert |
|----------|-------|-------|-------|
| task-complete | subtle | yes | banner |
| error | alert | yes | alert |
| suggestion | none | no | banner |
| update | subtle | yes | banner |
