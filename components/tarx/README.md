# TARX VS Code Components

14 VS Code native styled React components for the TARX chat UI.

## Components

### Chat Components (10)

| Component | Description |
|-----------|-------------|
| **ProjectContextCard** | Display project metadata (file, framework, language, database) |
| **VSCodeThinkingBlock** | Collapsible AI thinking/reasoning with expand toggle |
| **ErrorDetectionCard** | Display errors with before/after code comparison |
| **ArtifactCard** | Code suggestions with Copy/Add/Insert actions |
| **CodeComparisonCard** | Side-by-side before/after tab comparison |
| **PerformanceMetricsCard** | 3-column performance improvement display |
| **TestGenerationCard** | Generated test cases with coverage metrics |
| **ProjectIntegrationCard** | Multi-file impact display with expandable diffs |
| **VSCodeReasoningBlock** | Full expanded reasoning panel |
| **TodoListCard** | Checkable task list with icons |

### Utility Components (4)

| Component | Description |
|-----------|-------------|
| **FileUploadArea** | Drag & drop file upload with states |
| **ProgressIndicator** | Animated progress spinner |
| **ReactionsBar** | Thumbs up/down feedback buttons |
| **DeepDiveLink** | Expandable deep dive link |

## Usage

```typescript
import {
  ProjectContextCard,
  VSCodeThinkingBlock,
  ArtifactCard,
  // ... all components
} from './components/tarx';

// Render in message
<ProjectContextCard
  project="my-api"
  currentFile="src/server.ts"
  framework="Express.js"
  language="TypeScript"
/>

<ArtifactCard
  type="code"
  language="typescript"
  filename="utils.ts"
  content="function add(a: number, b: number) { return a + b; }"
  onCopy={() => navigator.clipboard.writeText(code)}
  onInsert={() => insertAtCursor(code)}
/>
```

## Styling

All components use VS Code CSS variables for native appearance:

```css
/* Colors */
--vscode-editor-background
--vscode-editor-foreground
--vscode-focusBorder
--vscode-button-background
--vscode-button-foreground

/* Spacing */
--vscode-space-xs: 4px
--vscode-space-sm: 8px
--vscode-space-md: 12px

/* Typography */
--vscode-font-family
--vscode-font-size: 13px
```

## Icons

Components use the Codicon icon font (VS Code's native icons):

```typescript
import { Codicon } from './components/tarx';

<Codicon name="file" size={14} />
<Codicon name="folder-opened" size={16} />
<Codicon name="check" size={14} />
```

## Structure

```
components/tarx/
├── chat/                    # 10 chat components
│   ├── ProjectContextCard.tsx
│   ├── VSCodeThinkingBlock.tsx
│   ├── ErrorDetectionCard.tsx
│   ├── ArtifactCard.tsx
│   ├── CodeComparisonCard.tsx
│   ├── PerformanceMetricsCard.tsx
│   ├── TestGenerationCard.tsx
│   ├── ProjectIntegrationCard.tsx
│   ├── VSCodeReasoningBlock.tsx
│   ├── TodoListCard.tsx
│   └── index.ts
├── utilities/               # 4 utility components
│   ├── FileUploadArea.tsx
│   ├── ProgressIndicator.tsx
│   ├── ReactionsBar.tsx
│   ├── DeepDiveLink.tsx
│   └── index.ts
├── Codicon.tsx              # Icon component
├── tokens.css               # VS Code CSS variables
├── index.ts                 # Main export
├── package.json
├── tsconfig.json
└── README.md
```

## Integration

These components are designed to render inline within VS Code's native chat panel.

Message response structure:
```typescript
interface ChatMessage {
  text: string;
  components: Array<{
    type: 'ProjectContextCard' | 'ArtifactCard' | ...;
    props: Record<string, unknown>;
  }>;
}
```

## License

MIT
