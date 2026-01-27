# TARX Code OSS - Fork Gotchas & Critical Knowledge

This document contains critical information for anyone working on the TARX Code OSS fork. **Read this before making any workbench/sidebar changes.**

---

## ⚠️ #1 CRITICAL: Sidebar Instantiation

**If your custom sidebar, Activity Bar icons, collapse behavior, or navigation changes don't appear — even after reloads and correct contributions — check this FIRST:**

### The Problem

VS Code's architecture separates:
- **Type definitions / imports** (layout.ts, workbench.ts)
- **Actual object creation** (services like `paneCompositePartService.ts`)

You can have perfect types, perfect contributions, perfect view registrations — and **still get vanilla behavior** if the instantiation line isn't changed.

### The Fix

**File:** `src/vs/workbench/browser/parts/paneCompositePartService.ts` (~line 36)

```typescript
// ❌ WRONG - Vanilla VS Code (your custom sidebar will NEVER appear):
this._sidebarPart = instantiationService.createInstance(SidebarPart);

// ✅ CORRECT - TARX fork (enables all custom navigation):
import { TarxSidebarPart } from './tarxsidebar/tarxSidebarPart.js';
this._sidebarPart = instantiationService.createInstance(TarxSidebarPart);
```

### Symptoms of Missing This Fix

- No errors in console
- Contributions look correct in package.json
- Reload / restart extension host does nothing
- Custom sidebar / icons / collapse / voice panel never appear
- Everything looks "vanilla VS Code"

### How to Verify

```bash
# Search for vanilla instantiation (should return NO results in TARX fork)
git grep "createInstance(SidebarPart)" --include="*.ts"

# Should find TarxSidebarPart instead
git grep "createInstance(TarxSidebarPart)" --include="*.ts"
```

---

## ⚠️ #2: Upstream Rebases Will Break This

Microsoft updates `paneCompositePartService.ts` frequently. A rebase/merge that reverts your `createInstance(TarxSidebarPart)` line back to `SidebarPart` will **silently kill your custom sidebar**.

### After Every Rebase

1. Check `paneCompositePartService.ts` for the instantiation line
2. Run the grep commands above
3. Test that TARX navigation appears

---

## #3: This Pattern Repeats Across Workbench Parts

The same instantiation pattern applies to other workbench parts:

| Part | Service File | Class to Override |
|------|--------------|-------------------|
| Sidebar | `paneCompositePartService.ts` | `SidebarPart` → `TarxSidebarPart` |
| Panel (bottom) | `paneCompositePartService.ts` | `PanelPart` → custom |
| Activity Bar | `activitybarPart.ts` | `ActivitybarPart` → custom |
| Title Bar | `titlebarPart.ts` | `TitlebarPart` → custom |
| Status Bar | `statusbarPart.ts` | `StatusbarPart` → custom |

If TARX needs to customize any of these, the same instantiation swap will be required.

---

## #4: Layout.ts Is NOT the Instantiation Point

A common misconception:

```typescript
// layout.ts - This is TYPE CASTING only, not instantiation!
const sidebar = this.getPart(Parts.SIDEBAR_PART) as TarxSidebarPart;
```

This line does NOT create the sidebar. It only tells TypeScript what type to expect. The actual creation happens in the service files.

---

## Quick Reference: Key Files

| File | Purpose |
|------|---------|
| `src/vs/workbench/browser/parts/paneCompositePartService.ts` | **Instantiation point** for sidebar |
| `src/vs/workbench/browser/parts/tarxsidebar/tarxSidebarPart.ts` | Main sidebar component |
| `src/vs/workbench/browser/parts/tarxsidebar/media/tarxSidebarPart.css` | Sidebar styling |
| `src/vs/workbench/browser/layout.ts` | Layout management (types only) |

---

## Claude Code Session Reminder

When working on sidebar, Activity Bar, navigation, voice icon, collapse, or any workbench UI:

1. ALWAYS verify `paneCompositePartService.ts` instantiates `TarxSidebarPart`, not `SidebarPart`
2. Search for `createInstance(SidebarPart)` and confirm it's overridden
3. After upstream rebases, re-check instantiation lines

---

*Last updated: January 2026*
