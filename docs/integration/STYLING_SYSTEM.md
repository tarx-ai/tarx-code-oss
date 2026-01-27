# TARX Styling System

## Overview

The TARX chat system uses VS Code's CSS variable system for full theme compatibility. All colors, fonts, and dimensions reference VS Code theme tokens.

## File Structure

```
src/vs/workbench/contrib/chat/browser/tarx/
└── media/
    └── tarxChat.css    # All TARX chat styles (~910 lines)
```

## CSS Import

**File**: `tarxChatPanel.ts:6`

```typescript
import './media/tarxChat.css';
```

## CSS Sections

| Section | Lines | Purpose |
|---------|-------|---------|
| Main Container | 12-22 | Panel flex layout |
| Header | 24-86 | Header bar styling |
| Recent Conversations | 88-207 | Dropdown component |
| Session Summary | 209-236 | Session info display |
| Messages Area | 238-301 | Message container + code blocks |
| Input Area | 303-396 | Text input + toolbar |
| Scrollbar | 398-421 | Custom scrollbar styling |
| Message Animations | 423-460 | Fade-in, content wrapper |
| Loading Message | 490-543 | Loading dots animation |
| Error Message | 545-639 | Error card styling |
| Artifact Cards | 641-831 | 13 artifact types |
| Reactions Bar | 833-887 | Thumbs up/down |
| Accessibility | 889-909 | Reduced motion |

## VS Code Theme Variables Used

### Colors

| Variable | Usage |
|----------|-------|
| `--vscode-editor-background` | Panel background |
| `--vscode-foreground` | Text color |
| `--vscode-panel-border` | Borders, separators |
| `--vscode-focusBorder` | Focus outlines |
| `--vscode-toolbar-hoverBackground` | Button hover |
| `--vscode-list-hoverBackground` | List item hover |
| `--vscode-input-background` | Input fields |
| `--vscode-input-foreground` | Input text |
| `--vscode-input-border` | Input borders |
| `--vscode-input-placeholderForeground` | Placeholder text |
| `--vscode-button-background` | Primary buttons |
| `--vscode-button-foreground` | Button text |
| `--vscode-button-hoverBackground` | Button hover |
| `--vscode-button-secondaryBackground` | Secondary buttons |
| `--vscode-textLink-foreground` | Links |
| `--vscode-textLink-activeForeground` | Link hover |
| `--vscode-textCodeBlock-background` | Code block bg |
| `--vscode-descriptionForeground` | Muted text |
| `--vscode-badge-background` | Badges |
| `--vscode-badge-foreground` | Badge text |
| `--vscode-errorForeground` | Error color |
| `--vscode-inputValidation-errorBorder` | Error borders |
| `--vscode-inputValidation-errorBackground` | Error bg |
| `--vscode-scrollbarSlider-background` | Scrollbar |
| `--vscode-scrollbarSlider-hoverBackground` | Scrollbar hover |
| `--vscode-gitDecoration-addedResourceForeground` | User prefix (#89d185) |
| `--vscode-gitDecoration-modifiedResourceForeground` | Assistant prefix (#e2c08d) |
| `--vscode-charts-green` | Success/checked (#22c55e) |

### Typography

| Variable | Usage |
|----------|-------|
| `--vscode-font-family` | UI text |
| `--vscode-editor-font-family` | Code, messages |

## Custom CSS Variables

### Artifact Colors
**File**: `tarxChat.css:647`

```css
.tarx-artifact-card {
  border-left: 4px solid var(--artifact-color, #3b82f6);
}
```

Set dynamically in TypeScript:
```typescript
container.style.setProperty('--artifact-color', TarxArtifactCard.COLOR_MAP[artifact.type]);
```

## Animation Keyframes

### Message Fade-in (200ms)
```css
@keyframes tarx-fade-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

### Loading Dots (1s loop)
```css
@keyframes tarx-typing-dots {
  0%, 20%, 100% {
    opacity: 0.3;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.2);
  }
}
```

### Error Slide-up (300ms)
```css
@keyframes tarx-error-slide-up {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

### Error Shake (200ms)
```css
@keyframes tarx-error-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}
```

## CSS Class Reference

### Container Classes

| Class | Element |
|-------|---------|
| `.tarx-chat-panel` | Root container |
| `.tarx-chat-view-pane` | ViewPane wrapper |
| `.tarx-chat-header` | Header bar |
| `.tarx-messages` | Messages scroll container |
| `.tarx-messages-list` | Message list |
| `.tarx-input-area` | Input section |

### Message Classes

| Class | Element |
|-------|---------|
| `.tarx-message` | Message container |
| `.tarx-message-user` | User message modifier |
| `.tarx-message-assistant` | Assistant message modifier |
| `.tarx-message-prefix` | Role prefix (> @user:) |
| `.tarx-message-content` | Message text |
| `.tarx-message-content-wrapper` | Content + artifacts wrapper |
| `.tarx-message-artifacts` | Artifacts container |
| `.tarx-message-reactions` | Reactions container |

### State Classes

| Class | Purpose |
|-------|---------|
| `.focused` | Input wrapper focus state |
| `.disabled` | Button disabled state |
| `.voted` | Active reaction state |
| `.checked` | Checked checkbox |
| `.success` | Copy success feedback |
| `.primary` | Primary button variant |

## Responsive Considerations

### Minimum Widths
- Messages: Full width with word-break
- Artifact cards: Min content width
- Input area: Full container width

### Height Constraints
- Input textarea: min 60px, max 200px
- Artifact content: max 200px with scroll
- Recent dropdown: max 180px with scroll

## Accessibility

### Focus Styles
```css
.tarx-chat-header-button:focus {
  outline: 1px solid var(--vscode-focusBorder);
  outline-offset: -1px;
}
```

### Reduced Motion
**File**: `tarxChat.css:893-909`

```css
@media (prefers-reduced-motion: reduce) {
  .tarx-chat-header-button,
  .tarx-message,
  .tarx-loading-dot,
  .tarx-error-message,
  .tarx-artifact-card,
  .tarx-reactions-bar,
  .tarx-reaction-btn {
    transition: none;
    animation: none;
  }
}
```

## Integration Points

### Adding New Component Styles

1. **Create section in tarxChat.css**:
```css
/* ============================================================================
   NEW COMPONENT
   ============================================================================ */

.tarx-new-component {
  /* Use VS Code variables only */
  background: var(--vscode-editor-background);
  color: var(--vscode-foreground);
  border: 1px solid var(--vscode-panel-border);
}
```

2. **Follow existing patterns**:
- Use `display: flex` for layouts
- 150ms transitions for hover states
- 4px border-radius standard
- 8px/12px/16px spacing scale

3. **Add to reduced motion query** if animated

### Theme Testing

Test with these themes:
- Light+ (default light)
- Dark+ (default dark)
- High Contrast
- High Contrast Light
- Monokai (popular)
- Solarized Light/Dark

### Dynamic Styling in TypeScript

```typescript
// Set CSS custom property
element.style.setProperty('--custom-property', value);

// Add/remove classes
element.classList.add('tarx-custom-class');
element.classList.toggle('active', isActive);

// Use VS Code DOM helpers
import * as dom from '../../../../../base/browser/dom.js';

const $ = dom.$;
const element = $('.tarx-component.modifier');
```

## Figma to CSS Mapping

| Figma Token | CSS Variable |
|-------------|--------------|
| Primary/Background | `--vscode-editor-background` |
| Primary/Text | `--vscode-foreground` |
| Primary/Border | `--vscode-panel-border` |
| Primary/Focus | `--vscode-focusBorder` |
| Button/Primary | `--vscode-button-background` |
| Button/Secondary | `--vscode-button-secondaryBackground` |
| Error/Background | `--vscode-inputValidation-errorBackground` |
| Error/Border | `--vscode-inputValidation-errorBorder` |
| Success | `--vscode-charts-green` |
| Code/Background | `--vscode-textCodeBlock-background` |
