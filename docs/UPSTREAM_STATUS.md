# TARX Fork — Upstream Status Report

**Date:** 2026-02-18
**Author:** Claude Code (CC5 session)

## Current Fork Version

| Field | Value |
|-------|-------|
| package.json version | `1.96.0` |
| Fork base | VS Code `main` branch snapshot, Jan 22 2026 |
| First upstream commit | `89251a1` — "Unified Agents Bar → Agent Quick Input (Experimental)" (#289556) |
| TARX commits on top | 30 (total 31 commits, 1 upstream base) |
| Git remote `origin` | `https://github.com/microsoft/vscode.git` |
| Branch | `main` |

## Key Insight

The fork was created from a **development snapshot** of VS Code's `main` branch on Jan 22, 2026 — NOT from the 1.96.0 release tag. This means the codebase contains features that were in development for 1.97+ but package.json was never bumped. The repo has a shallow history (31 commits total) with no upstream tags.

## Gap to VS Code 1.109

| Metric | Value |
|--------|-------|
| Version gap | 1.96.0 → 1.109 = ~13 minor versions |
| Time gap | Jan 2026 → Feb 2026 (1 month of active VS Code development) |
| Estimated upstream commits | ~500–1,500 (monthly release cadence) |
| Merge complexity | **HIGH** — shallow clone means no shared merge base |

## Features Available in Current Codebase

These features exist in the source (from the development snapshot) and are now **ENABLED** in `product.json`:

| Feature | Config Key | Status |
|---------|-----------|--------|
| Agent Skills | `chat.useAgentSkills` | **ENABLED** |
| Agent Skills Locations | `chat.agentSkillsLocations` | **ENABLED** (.tarx/skills, .github/skills, ~/.tarx/skills) |
| Agent Files Locations | `chat.agentFilesLocations` | **ENABLED** (.tarx/agents, .github/agents) |
| Terminal Sandbox | `chat.tools.terminal.sandbox.enabled` | **ENABLED** |
| Agent Sessions Welcome | `workbench.startupEditor: agentSessionsWelcomePage` | Available (not default — TARX uses "none") |
| Agent Quick Input | UI contribution | Present (from base commit) |

## Features NOT in Current Codebase

These features were shipped in 1.109 but are **NOT present** in our fork:

| Feature | Config Key | Notes |
|---------|-----------|-------|
| Ask Questions tool | `chat.askQuestions.enabled` | Not in source — shipped after our fork point |
| Thinking style config | `chat.thinking.style` | Not in source — TARX has its own `tarx.thinking.enabled` |
| Integrated Browser | `simpleBrowser.useIntegratedBrowser` | Not in source |
| Mermaid diagrams in chat | Built-in renderer | Unknown — may need upstream renderer |
| /plan agent | Built-in command | Not in source as a VS Code built-in |
| /init command | Built-in command | Not in source |
| Context window indicator | Chat UI widget | Unknown — may be present |

## Merge Feasibility

### Why a direct merge is risky

1. **Shallow clone**: The repo has only 31 commits. There's no shared merge base with upstream, so `git merge` will attempt a full-history merge which will fail or produce massive conflicts.
2. **Extensive TARX modifications**: 30 commits touching `extensions/tarx/` (custom), `product.json` (branding), `src/vs/workbench/` (sidebar, lock screen, Sentry), and core VS Code files (exorcism of Copilot/Cline references).
3. **Exorcism commits**: Three commits specifically removed Copilot/Cline code from VS Code core — an upstream merge would re-introduce all of it.

### Recommended Approach

**Phase 1 — Cherry-pick high-value features (1-2 sessions)**
- Identify specific commits for Ask Questions, /plan, /init from upstream
- Cherry-pick only those commits, resolve conflicts manually
- Lower risk, targeted benefit

**Phase 2 — Fresh fork from 1.109 release tag (dedicated project)**
- Clone VS Code 1.109 fresh
- Re-apply all 30 TARX commits on top
- Re-run exorcism
- Full test cycle
- Estimated effort: 2-3 full sessions

**Phase 3 — Ongoing upstream tracking**
- Set up `upstream` remote separately from `origin`
- Create a merge branch cadence (monthly)
- Automate conflict detection

## Next Steps

1. **Immediate**: Parts 1+2 of CC5 are done (branding, system prompt, feature flags)
2. **Short term**: Test enabled features (Agent Skills, Terminal Sandbox) in TARX
3. **Medium term**: Cherry-pick Ask Questions tool from upstream
4. **Long term**: Fresh 1.109 re-fork when V1.1 ship plan is complete

## Files Modified in This Session

- `extensions/tarx/src/router.ts` — Route indicator branding (⚡ → TARX)
- `extensions/tarx/src/systemPrompt.ts` — System prompt v3, local reasoning constraint
- `extensions/tarx/src/extension.ts` — Auth gate fix, followup provider, route display
- `extensions/tarx/package.json` — sampleRequest entries for chat welcome
- `product.json` — Agent Skills, Terminal Sandbox feature flags
- `docs/UPSTREAM_STATUS.md` — This document
