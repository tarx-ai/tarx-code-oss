# TARX Artifact Integration Guide

## Overview

Artifacts are rich, interactive content blocks that can be embedded in assistant messages. The system supports 13 distinct artifact types, each with specialized rendering and CTAs.

## Artifact Type System

**File**: `tarxArtifactCard.ts:18-31`

```typescript
export type ArtifactType =
  | 'code'                  // Source code blocks
  | 'refactored-code'       // Improved/refactored code
  | 'tests'                 // Test suites
  | 'config'                // Configuration files
  | 'benchmark'             // Performance benchmarks
  | 'spec'                  // Specifications
  | 'checklist'             // Task checklists
  | 'decision-matrix'       // Decision comparison tables
  | 'risk-assessment'       // Risk analysis
  | 'decision-log'          // Decision history
  | 'comparison'            // Side-by-side comparisons
  | 'multiple-options'      // Option lists
  | 'architecture-diagram'; // Architecture visualizations
```

## Artifact Interface

**File**: `tarxArtifactCard.ts:33-40`

```typescript
export interface ITarxArtifact {
  readonly id: string;
  readonly type: ArtifactType;
  readonly title: string;
  readonly content: string;
  readonly language?: string;        // For code types
  readonly metadata?: Record<string, unknown>;
}
```

## Visual Properties

### Color Coding
Each artifact type has a unique color for the left border:

| Type | Color | Hex |
|------|-------|-----|
| code | Blue | #3b82f6 |
| refactored-code | Purple | #8b5cf6 |
| tests | Green | #22c55e |
| config | Amber | #f59e0b |
| benchmark | Pink | #ec4899 |
| spec | Teal | #14b8a6 |
| checklist | Cyan | #06b6d4 |
| decision-matrix | Orange | #f97316 |
| risk-assessment | Red | #ef4444 |
| decision-log | Yellow | #eab308 |
| comparison | Violet | #a855f7 |
| multiple-options | Indigo | #6366f1 |
| architecture-diagram | Cyan-dark | #0891b2 |

### Icon Mapping
**File**: `tarxArtifactCard.ts:99-113`

| Type | Codicon |
|------|---------|
| code | Codicon.file |
| refactored-code | Codicon.symbolMethod |
| tests | Codicon.beaker |
| config | Codicon.settingsGear |
| benchmark | Codicon.dashboard |
| spec | Codicon.notebook |
| checklist | Codicon.checklist |
| decision-matrix | Codicon.table |
| risk-assessment | Codicon.warning |
| decision-log | Codicon.history |
| comparison | Codicon.splitHorizontal |
| multiple-options | Codicon.listFlat |
| architecture-diagram | Codicon.typeHierarchy |

## Artifact Card Structure

```html
<div class="tarx-artifact-card" role="region"
     aria-label="{type} artifact: {title}"
     style="--artifact-color: {color}">

  <!-- Header -->
  <div class="tarx-artifact-header">
    <div class="tarx-artifact-icon"><span class="{icon}"></span></div>
    <h4 class="tarx-artifact-title">{title}</h4>
    <span class="tarx-artifact-badge">{typeLabel}</span>
    <span class="tarx-artifact-lang">{language}</span> <!-- code types only -->
  </div>

  <!-- Content -->
  <div class="tarx-artifact-content">
    <!-- Rendered based on type -->
  </div>

  <!-- Actions -->
  <div class="tarx-artifact-actions">
    <button class="tarx-artifact-btn">View</button>
    <button class="tarx-artifact-btn">Copy</button>
    <button class="tarx-artifact-btn">Insert</button>
    <button class="tarx-artifact-btn primary">Apply</button> <!-- refactored-code only -->
  </div>
</div>
```

## Content Rendering by Type

### Code Types (code, refactored-code, tests, config)
**File**: `tarxArtifactCard.ts:191-221`

- Renders in `<pre><code>` blocks
- Truncates to 10 lines by default
- Expand/collapse button for long content
- Language class for syntax highlighting

### Checklist Type
**File**: `tarxArtifactCard.ts:256-277`

- Parses markdown checkbox syntax: `- [x]` or `- [ ]`
- Renders as `<ul>` with visual checkmarks
- Checkmark (✓) for completed, circle (○) for pending

### Table Types (decision-matrix, comparison)
**File**: `tarxArtifactCard.ts:279-303`

- Detects markdown table syntax
- Renders as HTML `<table>`
- Falls back to plain text if no table detected

### Text Types (all others)
**File**: `tarxArtifactCard.ts:223-254`

- Plain text with 500 character truncation
- Expand/collapse for long content

## Event System

### Events Emitted

```typescript
readonly onDidView: Event<ITarxArtifact>;   // User clicked "View"
readonly onDidCopy: Event<string>;          // User clicked "Copy" (content)
readonly onDidInsert: Event<string>;        // User clicked "Insert" (content)
readonly onDidApply: Event<ITarxArtifact>;  // User clicked "Apply" (refactored-code only)
```

### Event Handling in MessageRenderer

**File**: `tarxMessageRenderer.ts:258-269`

```typescript
private renderArtifacts(container: HTMLElement, artifacts: ITarxArtifact[]): void {
  for (const artifact of artifacts) {
    const card = this.instantiationService.createInstance(TarxArtifactCard, { artifact });
    card.render(container);

    this._register(card.onDidView(a => this._onDidViewArtifact.fire(a)));
    this._register(card.onDidCopy(content => {
      this.copyToClipboard(content);
      this._onDidCopyArtifact.fire(content);
    }));
    this._register(card.onDidInsert(content => this._onDidInsertArtifact.fire(content)));
  }
}
```

## Integration Points

### Adding New Artifact Types

1. **Add to type union**: `tarxArtifactCard.ts:18-31`
2. **Add color**: `COLOR_MAP` at line 80-94
3. **Add icon**: `ICON_MAP` at line 99-113
4. **Add label**: `TYPE_LABELS` at line 118-132
5. **Add render method** if special rendering needed

### Extending Artifact Actions

The action bar is rendered in `renderActions()`:

```typescript
private renderActions(container: HTMLElement, artifact: ITarxArtifact): void {
  // Add new action button:
  const customBtn = this.createActionButton(container, Codicon.customIcon, 'Custom Action');
  this._register(dom.addDisposableListener(customBtn, dom.EventType.CLICK, () => {
    this._onDidCustomAction.fire(artifact);
  }));
}
```

### Using Static Factory

For simple inline usage without DI:

```typescript
const element = TarxArtifactCard.create(
  artifact,
  (a) => handleView(a),
  (content) => handleCopy(content),
  (content) => handleInsert(content)
);
parent.appendChild(element);
```

## Figma Component Mapping

| Figma Component | TARX Implementation |
|-----------------|---------------------|
| Artifact Card Container | `.tarx-artifact-card` |
| Type Indicator Border | `--artifact-color` CSS variable |
| Type Icon | `.tarx-artifact-icon` |
| Title | `.tarx-artifact-title` |
| Type Badge | `.tarx-artifact-badge` |
| Language Badge | `.tarx-artifact-lang` |
| Content Area | `.tarx-artifact-content` |
| Action Buttons | `.tarx-artifact-btn` |
| Primary Action | `.tarx-artifact-btn.primary` |
