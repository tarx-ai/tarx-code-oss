# TARX Extension Architecture

## Strategic Decision: Extension-First Approach

Instead of deep workbench integration (hacking main.ts, app.ts, IPC channels), we build TARX as a **bundled extension** that ships with Code-OSS. This approach:

- Uses stable VS Code extension APIs
- Is maintainable and upgradeable
- Follows VS Code patterns
- Can later be published to Open VSX

---

## TARX Feature → VS Code API Mapping

| TARX Feature | VS Code API | Implementation |
|--------------|-------------|----------------|
| Chat UI (sidebar) | `WebviewViewProvider` | React webview in AuxiliaryBar |
| Code Completions | `InlineCompletionItemProvider` | Stream from llama-server:11435 |
| Context Files | `TreeDataProvider` | Show files added to context |
| Quick Actions | `CodeActionProvider` | "Explain", "Fix", "Refactor" |
| Status Bar | `StatusBarItem` | Show model/connection status |
| Commands | `commands.registerCommand` | /tarx commands |
| Settings | `configuration` contribution | API keys, model prefs |

---

## Extension Structure

```
extensions/tarx/
├── package.json              # Extension manifest
├── src/
│   ├── extension.ts          # Entry point (activate/deactivate)
│   ├── chatViewProvider.ts   # WebviewViewProvider for chat
│   ├── completionProvider.ts # InlineCompletionItemProvider
│   ├── contextTreeProvider.ts# TreeDataProvider for context files
│   ├── statusBar.ts          # StatusBarItem management
│   ├── commands.ts           # Command handlers
│   ├── tarxClient.ts         # HTTP client for llama-server
│   └── webview/
│       ├── index.html        # Chat UI shell
│       ├── chat.tsx          # React chat component
│       └── styles.css
├── media/
│   └── icon.svg              # Extension icon
└── tsconfig.json
```

---

## 1. Chat UI - WebviewViewProvider

### Registration (package.json)

```json
{
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "tarx",
          "icon": "$(robot)",
          "title": "TARX"
        }
      ]
    },
    "views": {
      "tarx": [
        {
          "id": "tarx.chat",
          "name": "Chat",
          "type": "webview"
        }
      ]
    }
  }
}
```

### Implementation (chatViewProvider.ts)

```typescript
import * as vscode from 'vscode';

export class TarxChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'tarx.chat';

  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlContent(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'sendMessage':
          const response = await this.sendToLlama(message.text);
          this._view?.webview.postMessage({ type: 'response', text: response });
          break;
      }
    });
  }

  private async sendToLlama(prompt: string): Promise<string> {
    const response = await fetch('http://localhost:11435/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'default',
        messages: [{ role: 'user', content: prompt }],
        stream: false
      })
    });
    const data = await response.json();
    return data.choices[0].message.content;
  }

  private _getHtmlContent(webview: vscode.Webview): string {
    // Return React app HTML
    return `<!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta http-equiv="Content-Security-Policy"
            content="default-src 'none';
                     connect-src http://localhost:11435;
                     script-src ${webview.cspSource};
                     style-src ${webview.cspSource};">
        </head>
        <body>
          <div id="root"></div>
          <script src="${webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'chat.js'))}"></script>
        </body>
      </html>`;
  }
}
```

---

## 2. Code Completions - InlineCompletionItemProvider

### Registration (extension.ts)

```typescript
const completionProvider = new TarxCompletionProvider();
context.subscriptions.push(
  vscode.languages.registerInlineCompletionItemProvider(
    { pattern: '**' }, // All files
    completionProvider
  )
);
```

### Implementation (completionProvider.ts)

```typescript
import * as vscode from 'vscode';

export class TarxCompletionProvider implements vscode.InlineCompletionItemProvider {

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[]> {

    // Get context (previous lines)
    const prefix = document.getText(new vscode.Range(
      new vscode.Position(Math.max(0, position.line - 50), 0),
      position
    ));

    // Get suffix (next few lines for FIM)
    const suffix = document.getText(new vscode.Range(
      position,
      new vscode.Position(Math.min(document.lineCount, position.line + 10), 0)
    ));

    try {
      const response = await fetch('http://localhost:11435/v1/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prefix,
          suffix: suffix,
          max_tokens: 128,
          temperature: 0.2,
          stop: ['\n\n', '```']
        }),
        signal: AbortSignal.timeout(2000) // 2s timeout
      });

      if (token.isCancellationRequested) return [];

      const data = await response.json();
      const completion = data.choices[0]?.text;

      if (!completion) return [];

      return [{
        insertText: completion,
        range: new vscode.Range(position, position)
      }];
    } catch {
      return []; // Silent fail - no completions available
    }
  }
}
```

---

## 3. Context Files - TreeDataProvider

### Registration (package.json)

```json
{
  "contributes": {
    "views": {
      "tarx": [
        {
          "id": "tarx.chat",
          "name": "Chat",
          "type": "webview"
        },
        {
          "id": "tarx.context",
          "name": "Context Files"
        }
      ]
    }
  }
}
```

### Implementation (contextTreeProvider.ts)

```typescript
import * as vscode from 'vscode';

export class TarxContextTreeProvider implements vscode.TreeDataProvider<ContextFile> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ContextFile | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private contextFiles: ContextFile[] = [];

  addFile(uri: vscode.Uri): void {
    this.contextFiles.push(new ContextFile(uri));
    this._onDidChangeTreeData.fire(undefined);
  }

  removeFile(uri: vscode.Uri): void {
    this.contextFiles = this.contextFiles.filter(f => f.uri.toString() !== uri.toString());
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ContextFile): vscode.TreeItem {
    return element;
  }

  getChildren(): ContextFile[] {
    return this.contextFiles;
  }
}

class ContextFile extends vscode.TreeItem {
  constructor(public readonly uri: vscode.Uri) {
    super(vscode.workspace.asRelativePath(uri), vscode.TreeItemCollapsibleState.None);
    this.tooltip = uri.fsPath;
    this.iconPath = vscode.ThemeIcon.File;
    this.contextValue = 'contextFile';
    this.command = {
      command: 'vscode.open',
      title: 'Open File',
      arguments: [uri]
    };
  }
}
```

---

## 4. Status Bar

### Implementation (statusBar.ts)

```typescript
import * as vscode from 'vscode';

export class TarxStatusBar {
  private statusBarItem: vscode.StatusBarItem;
  private pollInterval: NodeJS.Timeout | undefined;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'tarx.showStatus';
    this.update();
    this.startPolling();
  }

  private async update(): Promise<void> {
    try {
      const response = await fetch('http://localhost:11435/health', {
        signal: AbortSignal.timeout(2000)
      });

      if (response.ok) {
        const data = await response.json();
        this.statusBarItem.text = `$(robot) TARX: ${data.model || 'Ready'}`;
        this.statusBarItem.backgroundColor = undefined;
      } else {
        this.setDisconnected();
      }
    } catch {
      this.setDisconnected();
    }

    this.statusBarItem.show();
  }

  private setDisconnected(): void {
    this.statusBarItem.text = '$(robot) TARX: Offline';
    this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }

  private startPolling(): void {
    this.pollInterval = setInterval(() => this.update(), 10000);
  }

  dispose(): void {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.statusBarItem.dispose();
  }
}
```

---

## 5. Extension Entry Point

### Implementation (extension.ts)

```typescript
import * as vscode from 'vscode';
import { TarxChatViewProvider } from './chatViewProvider';
import { TarxCompletionProvider } from './completionProvider';
import { TarxContextTreeProvider } from './contextTreeProvider';
import { TarxStatusBar } from './statusBar';

export function activate(context: vscode.ExtensionContext) {
  console.log('[TARX] Extension activating...');

  // 1. Register Chat WebviewView
  const chatProvider = new TarxChatViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      TarxChatViewProvider.viewType,
      chatProvider
    )
  );

  // 2. Register Inline Completions
  const completionProvider = new TarxCompletionProvider();
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      { pattern: '**' },
      completionProvider
    )
  );

  // 3. Register Context Tree
  const contextTreeProvider = new TarxContextTreeProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('tarx.context', contextTreeProvider)
  );

  // 4. Register Status Bar
  const statusBar = new TarxStatusBar();
  context.subscriptions.push(statusBar);

  // 5. Register Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('tarx.addToContext', (uri: vscode.Uri) => {
      contextTreeProvider.addFile(uri);
    }),
    vscode.commands.registerCommand('tarx.removeFromContext', (item: any) => {
      contextTreeProvider.removeFile(item.uri);
    }),
    vscode.commands.registerCommand('tarx.showStatus', () => {
      vscode.window.showInformationMessage('TARX: Connected to localhost:11435');
    })
  );

  console.log('[TARX] Extension activated');
}

export function deactivate() {
  console.log('[TARX] Extension deactivated');
}
```

---

## 6. Extension Manifest (package.json)

```json
{
  "name": "tarx",
  "displayName": "TARX SuperComputer",
  "description": "Local-first AI inference with GPU acceleration",
  "version": "0.1.0",
  "publisher": "tarx-ai",
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": ["AI", "Machine Learning"],
  "activationEvents": ["onStartupFinished"],
  "main": "./out/extension.js",
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "tarx",
          "icon": "$(robot)",
          "title": "TARX"
        }
      ]
    },
    "views": {
      "tarx": [
        {
          "id": "tarx.chat",
          "name": "Chat",
          "type": "webview"
        },
        {
          "id": "tarx.context",
          "name": "Context Files"
        }
      ]
    },
    "commands": [
      {
        "command": "tarx.addToContext",
        "title": "Add to TARX Context"
      },
      {
        "command": "tarx.removeFromContext",
        "title": "Remove from Context",
        "icon": "$(close)"
      },
      {
        "command": "tarx.showStatus",
        "title": "TARX: Show Status"
      }
    ],
    "menus": {
      "explorer/context": [
        {
          "command": "tarx.addToContext",
          "group": "tarx"
        }
      ],
      "view/item/context": [
        {
          "command": "tarx.removeFromContext",
          "when": "view == tarx.context && viewItem == contextFile",
          "group": "inline"
        }
      ]
    },
    "configuration": {
      "title": "TARX",
      "properties": {
        "tarx.serverUrl": {
          "type": "string",
          "default": "http://localhost:11435",
          "description": "TARX inference server URL"
        },
        "tarx.completions.enabled": {
          "type": "boolean",
          "default": true,
          "description": "Enable inline code completions"
        },
        "tarx.completions.debounceMs": {
          "type": "number",
          "default": 300,
          "description": "Debounce delay for completions"
        }
      }
    }
  },
  "scripts": {
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./"
  },
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "typescript": "^5.0.0"
  }
}
```

---

## Build & Integration

### Bundling with Code-OSS

1. Place extension in `extensions/tarx/`
2. Add to `.build/extensions` manifest
3. Extension loads automatically via `--enable-proposed-api tarx`

### Development Workflow

```bash
# In extensions/tarx/
npm install
npm run watch

# Extension reloads on Code-OSS restart
./scripts/code.sh --extensionDevelopmentPath=./extensions/tarx
```

---

## Port Architecture

| Port | Service | Used For |
|------|---------|----------|
| 11435 | llama-server | Inference (chat, completions) |
| 11436 | Mesh HTTP API | P2P compute sharing |
| 11437 | Embeddings | RAG/semantic search |

---

## Phase Implementation

### Phase 1: MVP
- [x] WebviewViewProvider for chat
- [x] Basic HTTP client to llama-server
- [x] Status bar connection indicator

### Phase 2: Completions
- [ ] InlineCompletionItemProvider
- [ ] Debouncing and caching
- [ ] FIM (Fill-in-Middle) support

### Phase 3: Context
- [ ] TreeDataProvider for context files
- [ ] Drag-drop files to chat
- [ ] @-mention file references

### Phase 4: Advanced
- [ ] Chat participant API integration
- [ ] CodeActionProvider (quick fixes)
- [ ] Embedded terminal for TARX CLI

---

## Cleanup: Remove Deep Workbench Integration

The previous approach added TARX code to:
- `src/vs/code/electron-main/main.ts`
- `src/vs/code/electron-main/app.ts`
- `src/vs/platform/tarx/` (service layer)
- `src/vs/workbench/contrib/tarx/` (view contribution)

This should be removed in favor of the extension approach. The extension-first strategy is cleaner, more maintainable, and follows VS Code conventions.
