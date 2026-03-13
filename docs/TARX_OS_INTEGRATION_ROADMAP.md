# TARX OS Integration Roadmap

**Last Updated:** February 12, 2026
**Status:** Design Complete — Implementation Ready

---

## Overview

This roadmap defines the phased implementation of TARX's OS-native AI agent capabilities. Each phase builds on the previous, with clear success criteria and dependencies.

---

## V1.2: Foundation (Next Release)

**Target:** 2 weeks from start
**Theme:** Make TARX feel native

### Tasks

- [ ] **System Tray with Health Indicator**
  - File: `src/vs/platform/tarx/electron-main/tarxTray.ts` ✅ (created)
  - Menu bar icon with green/yellow/red status
  - Context menu with Quick Chat, Recent Projects, Settings
  - Health monitoring every 30 seconds
  - Integration with CodeApplication startup

- [ ] **Global Shortcut (Cmd+Shift+T)**
  - File: `src/vs/platform/tarx/electron-main/tarxGlobalShortcut.ts` ✅ (created)
  - Toggle window visibility
  - Focus chat input on show
  - Configurable accelerator in settings

- [ ] **Basic Notifications**
  - File: `src/vs/platform/tarx/electron-main/tarxNotifications.ts` ✅ (created)
  - Task complete notifications
  - Error notifications (bypass rate limit)
  - Rate limiting: max 3 per hour
  - Action buttons support

- [ ] **Permission Manager (Tier 0-1)**
  - File: `src/vs/platform/tarx/electron-main/tarxPermissions.ts` ✅ (created)
  - Session counting for trust progression
  - Consent dialog component
  - Tier upgrade prompts after 3 sessions
  - Permission storage and export

### Integration Points

```typescript
// In src/vs/code/electron-main/app.ts startup():
// 1. Initialize permission service
const permissionService = this.instantiationService.createInstance(TarxPermissionService);
permissionService.incrementSessionCount();

// 2. Check for tier upgrade prompt
if (permissionService.shouldPromptForTierUpgrade()) {
  await permissionService.requestTierUpgrade(1);
}

// 3. Create tray if Tier 2+ or always visible setting
if (permissionService.getTier() >= 2 || this.configService.getValue('tarx.tray.alwaysShow')) {
  const tray = this.instantiationService.createInstance(TarxTrayService);
  tray.create(this.mainWindow);
}

// 4. Register global shortcut if Tier 2+
if (permissionService.getTier() >= 2) {
  const shortcut = this.instantiationService.createInstance(TarxGlobalShortcutService);
  shortcut.register(this.mainWindow);
}
```

### Success Criteria

- [ ] System tray visible on macOS menu bar
- [ ] Tray icon reflects actual health status
- [ ] Cmd+Shift+T toggles window visibility
- [ ] Chat input focused when window shown via shortcut
- [ ] Notifications appear for task completion
- [ ] Rate limiting prevents notification spam
- [ ] Permissions persist across sessions
- [ ] Tier upgrade prompt appears after 3 sessions

---

## V1.3: Integration (Following Release)

**Target:** 4 weeks from V1.2
**Theme:** Deep OS integration

### Tasks

- [ ] **File Watcher + Auto-RAG Indexing**
  - File: `src/vs/platform/tarx/electron-main/tarxFileWatcher.ts` ✅ (created)
  - Watch project directories for changes
  - Auto-index new/changed files into RAG
  - Debouncing to prevent excessive indexing
  - Respect .gitignore patterns

- [ ] **Rich Notifications with Actions**
  - Action buttons that trigger callbacks
  - "Add to .gitignore" for .env files
  - "Summarize" for new PDFs
  - Click-to-action callbacks

- [ ] **macOS Finder Context Menu**
  - Finder extension (separate Xcode project)
  - "Ask TARX about this" menu item
  - Deep link: `tarx-code://ask?file=<path>`

- [ ] **Windows Explorer Context Menu**
  - Shell extension registration
  - Registry entries for context menu
  - Same functionality as macOS

- [ ] **Auto-Start on Login**
  - Login item registration
  - Start minimized to tray
  - Background health monitoring

### Success Criteria

- [ ] File changes in project trigger RAG re-indexing
- [ ] .env files trigger gitignore suggestion
- [ ] Right-click "Ask TARX" works in Finder
- [ ] Right-click "Ask TARX" works in Explorer
- [ ] TARX starts automatically on login (if enabled)
- [ ] Starts minimized to tray

---

## V2.0: Proactive (Major Release)

**Target:** Q2 2026
**Theme:** TARX anticipates your needs

### Tasks

- [ ] **Proactive Suggestion Engine**
  - File: `src/vs/platform/tarx/electron-main/tarxProactive.ts`
  - Monitor file saves for suggestions
  - Monitor downloads for actions
  - Non-intrusive notification style

- [ ] **App-Aware Context Switching**
  - Detect active application
  - Adjust context for Terminal, Browser, Figma
  - Prepare relevant RAG context

- [ ] **Idle-Time Background Processing**
  - Detect 5+ minute idle
  - Background RAG optimization
  - Mesh network sync
  - No notifications during idle processing

- [ ] **CLI Command `tarx`**
  - Install globally via PATH
  - `tarx chat "question"` — quick chat
  - `tarx index /path` — index directory
  - `tarx status` — health check

- [ ] **AppleScript/Shortcuts Integration (macOS)**
  - AppleScript dictionary
  - Shortcuts app actions
  - "Hey Siri, ask TARX"

- [ ] **PowerShell Module (Windows)**
  - `Install-Module TarxAI`
  - `Invoke-TarxChat "question"`
  - `Get-TarxStatus`

### Success Criteria

- [ ] Proactive .env → gitignore suggestions
- [ ] Context adapts to active application
- [ ] Background indexing during idle
- [ ] `tarx chat "hello"` works from terminal
- [ ] Siri Shortcuts integration works
- [ ] PowerShell module installable

---

## V3.0: Full Agent (Future)

**Target:** Q4 2026
**Theme:** TARX acts on your behalf

### Tasks

- [ ] **Full Agent Mode (Tier 4)**
  - Per-action approval dialogs
  - Shell command preview before execution
  - Audit logging of all actions
  - Rollback capability

- [ ] **Per-Action Approval UI**
  - Show command preview
  - Explain what will change
  - "Trust this type" checkbox
  - Cancel/Edit/Run buttons

- [ ] **Browser Extension Bridge**
  - Chrome/Firefox extension
  - Send webpage context to TARX
  - "Ask TARX about this page"

- [ ] **Cross-Device Mesh Sync**
  - Sync RAG knowledge across devices
  - Peer discovery via libp2p
  - Encrypted data transfer

- [ ] **Voice Hotword "Hey TARX"**
  - Always-listening mode (opt-in)
  - Wake word detection
  - Voice-to-text via Whisper

### Success Criteria

- [ ] Shell commands require explicit approval
- [ ] Browser extension sends context
- [ ] RAG syncs across multiple TARX instances
- [ ] "Hey TARX" activates voice input

---

## Dependencies

### V1.2 Dependencies
- Tray icons created (tray-healthy.png, tray-degraded.png, tray-offline.png)
- IPC handler for `tarx:focus-chat` in renderer
- Settings schema for tray/shortcut preferences

### V1.3 Dependencies
- V1.2 complete
- Finder extension signing/notarization
- Windows shell extension build pipeline

### V2.0 Dependencies
- V1.3 complete
- AppleScript dictionary definition
- PowerShell module packaging

### V3.0 Dependencies
- V2.0 complete
- Browser extension review/publish
- Voice wake word model training

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Global shortcut conflicts | Detect conflicts, offer alternatives |
| Notification fatigue | Strict rate limiting, user control |
| File watcher performance | Debouncing, exclude patterns |
| Permission creep | Progressive model, clear explanations |
| Finder extension signing | Budget for Apple Developer Program |
| Windows SmartScreen | Code signing certificate |

---

## Metrics

### V1.2 Metrics
- Tray adoption rate (% users with tray visible)
- Shortcut usage frequency
- Notification click-through rate
- Tier upgrade acceptance rate

### V1.3 Metrics
- File watcher indexing throughput
- Context menu usage
- Auto-start enable rate

### V2.0 Metrics
- Proactive suggestion acceptance rate
- CLI usage frequency
- Background task completion

### V3.0 Metrics
- Agent action approval rate
- Browser extension DAU
- Cross-device sync adoption

---

## Implementation Order

1. **tarxPermissions.ts** — Foundation for everything else
2. **tarxTray.ts** — Most visible user value
3. **tarxGlobalShortcut.ts** — Quick access
4. **tarxNotifications.ts** — User feedback
5. **tarxFileWatcher.ts** — Background intelligence
6. **tarxProactive.ts** — Anticipatory assistance
7. Context menus (platform-specific)
8. CLI command
9. Full agent mode

---

## Code Review Checklist

- [ ] Services registered in `src/vs/code/electron-main/app.ts`
- [ ] Interfaces exported from `src/vs/platform/tarx/common/tarx.ts`
- [ ] IPC channels defined in `src/vs/platform/tarx/common/tarxIpc.ts`
- [ ] Unit tests in `src/vs/platform/tarx/test/`
- [ ] Settings schema in `src/vs/platform/configuration/common/`
- [ ] Error handling with Datadog integration
- [ ] Memory leak prevention (proper disposal)
- [ ] Permissions checked before sensitive operations
