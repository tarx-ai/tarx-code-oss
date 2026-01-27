# TARX Design System

Centralized design tokens for consistent UI/UX across TARX extensions.

## Overview

This design system uses VS Code's theme engine for proper integration while providing fallback raw colors for custom use cases.

## Files

- `src/design-tokens.ts` - Colors, typography, spacing tokens
- `src/icons.ts` - Icon mappings using VS Code ThemeIcon (codicons)

## Usage

### Theme Colors (Recommended)

For proper VS Code theme integration:

```typescript
import { ThemeColors, themeColor } from './design-tokens';

// Status bar backgrounds
statusBarItem.backgroundColor = themeColor(ThemeColors.statusBarWarning);
statusBarItem.backgroundColor = themeColor(ThemeColors.statusBarError);
```

### Raw Colors (Fallback)

For custom UI elements where ThemeColor isn't supported:

```typescript
import { Colors } from './design-tokens';

const primaryColor = Colors.primary;        // #ff6b2b
const successColor = Colors.success;        // #22c55e
const bgPrimary = Colors.bg.primary;        // #0a0a0a
```

### Icons

```typescript
import { statusIcon, icon, Symbols, TarxIcons } from './icons';

// Status bar text with codicon
statusBarItem.text = `${statusIcon('robot')} TARX: Ready`;

// TreeItem icon
treeItem.iconPath = icon('check');

// Unicode symbols for simple text
meshStatusItem.text = `${Symbols.meshOn} Mesh: ON`;

// TARX-specific presets
statusBarItem.text = TarxIcons.connectedStatus();  // "✓"
```

## Color Reference

### Primary (TARX Brand)
| Token | Value | Usage |
|-------|-------|-------|
| `primary` | `#ff6b2b` | Primary actions, focus states |
| `primaryHover` | `#ff8552` | Hover states |
| `primaryActive` | `#e55a1a` | Active/pressed states |

### Status
| Token | Value | Usage |
|-------|-------|-------|
| `success` | `#22c55e` | Success indicators |
| `warning` | `#f59e0b` | Warning indicators |
| `error` | `#ef4444` | Error indicators |
| `info` | `#3b82f6` | Info indicators |

### Backgrounds
| Token | Value | Usage |
|-------|-------|-------|
| `bg.primary` | `#0a0a0a` | Main background |
| `bg.secondary` | `#121212` | Secondary background |
| `bg.hover` | `#232323` | Hover state |
| `bg.selected` | `#2a2a2a` | Selected state |

### Text
| Token | Value | Usage |
|-------|-------|-------|
| `text.primary` | `#ffffff` | Primary text |
| `text.secondary` | `#b4b4b4` | Secondary text |
| `text.muted` | `#6b6b6b` | Muted text |
| `text.disabled` | `#4b4b4b` | Disabled text |

## Icon Reference

### Common Codicons
| Name | ID | Usage |
|------|-----|-------|
| `robot` | `robot` | TARX branding |
| `check` | `check` | Success |
| `error` | `error` | Error |
| `warning` | `warning` | Warning |
| `loading` | `loading~spin` | Loading spinner |
| `settings` | `settings-gear` | Settings |

### Unicode Symbols
| Name | Symbol | Usage |
|------|--------|-------|
| `checkmark` | ✓ | Success indicator |
| `crossmark` | ✗ | Error indicator |
| `meshOn` | ⊙ | Mesh enabled |
| `meshOff` | ⊘ | Mesh disabled |

## Typography

```typescript
import { Typography } from './design-tokens';

// Font families
const uiFont = Typography.fontFamily.sans;
const codeFont = Typography.fontFamily.mono;

// Font sizes
const small = Typography.fontSize.sm;   // 13px
const base = Typography.fontSize.base;  // 14px
const large = Typography.fontSize.lg;   // 16px
```

## Adding New Tokens

1. Edit `src/design-tokens.ts`
2. Add to appropriate section (Colors, Typography, etc.)
3. Export in default export
4. Run `npm run compile`

## VS Code Theme Integration

The design system integrates with VS Code's theme engine:

```typescript
// Use ThemeColor for status bar backgrounds
import { themeColor, ThemeColors } from './design-tokens';

statusBarItem.backgroundColor = themeColor(ThemeColors.statusBarWarning);
```

Available theme color IDs:
- `statusBarItem.warningBackground`
- `statusBarItem.errorBackground`
- `statusBarItem.prominentBackground`
- `charts.green`, `charts.red`, `charts.yellow`, etc.

## Best Practices

1. **Prefer ThemeColor** for elements that should respect VS Code themes
2. **Use raw Colors** only for custom UI that doesn't integrate with VS Code theming
3. **Use StatusIcons/Symbols** for status bar text (Unicode works everywhere)
4. **Use ThemeIcon** for TreeView, QuickPick, and other VS Code UI elements
