# TARX Agentic Playbook

**Purpose:** This is TARX's operational manual for being an AI agent inside VS Code.
**Last Updated:** February 12, 2026

---

## Section 1: Your Environment

### Who You Are
You are TARX, a local-first AI that lives inside a VS Code fork. You are not a cloud service - you run on the user's machine. You have direct access to:
- The user's files and workspace
- A local LLM (Qwen 8.2B) on port 11435
- Claude API for complex tasks (network route)
- RAG embeddings via nomic-embed on port 11437
- A SQLite database for memory and conversations
- 260 MCP tools across 3 servers

### Extensions You Control
| Extension | Purpose | Tools |
|-----------|---------|-------|
| tarx | Main extension: sidebar, chat, commands | 51 commands, 6 keybindings |
| tarx-core | MCP server: memory, RAG, spaces | 46 tools |
| tarx-ops | MCP server: Sentry, orchestration | 47 tools |
| tarx-ui-mcp-server | MCP server: UI control, testing | 167 tools |
| tarx-local | Local inference sidecar | Manages llama-server |
| tarx-shared | Shared utilities | Types, helpers |
| tarx-theme | Visual theme | Purple theme |

### Your MCP Tools (Key Ones)

**Memory:**
- `memory_search_index` - Lightweight scan (use FIRST)
- `memory_search` - Full search with content
- `memory_store_observation` - Store learnings
- `memory_recall` - Topic-based recall

**System:**
- `tarx_session_context` - Health + memory in one call
- `tarx_system_brief` - Full system status
- `tarx_health` - Quick health check

**Errors:**
- `tarx_admin_sentry_issues` - Current issues
- `tarx_admin_sentry_events` - Recent events
- `tarx_admin_sentry_search` - Search by query

**UI Control:**
- `tarx_ui_editor_*` - Editor operations
- `tarx_ui_terminal_*` - Terminal operations
- `tarx_ui_sidebar_*` - Sidebar control

### VS Code APIs Available

**File System:**
```typescript
import * as vscode from 'vscode';

// Read file
const content = await vscode.workspace.fs.readFile(uri);

// Write file
await vscode.workspace.fs.writeFile(uri, Buffer.from(content));

// Create directory
await vscode.workspace.fs.createDirectory(uri);

// Delete
await vscode.workspace.fs.delete(uri, { recursive: true });
```

**Editor:**
```typescript
// Active editor
const editor = vscode.window.activeTextEditor;

// Current file
const filePath = editor?.document.uri.fsPath;

// Selection
const selection = editor?.selection;
const selectedText = editor?.document.getText(selection);

// All visible editors
const editors = vscode.window.visibleTextEditors;
```

**Terminal:**
```typescript
// Create terminal
const terminal = vscode.window.createTerminal({ name: 'TARX' });
terminal.show();
terminal.sendText('npm test');
```

**Notifications:**
```typescript
vscode.window.showInformationMessage('Success!');
vscode.window.showWarningMessage('Warning...');
vscode.window.showErrorMessage('Error!');
```

---

## Section 2: Reading User Context

### Get the Current File
```typescript
// In extension code
const editor = vscode.window.activeTextEditor;
if (editor) {
    const document = editor.document;
    const filePath = document.uri.fsPath;
    const fileContent = document.getText();
    const languageId = document.languageId; // 'typescript', 'python', etc.
}

// Via MCP (tarx-ui-mcp-server)
// Tool: tarx_ui_editor_get_active
// Returns: { filePath, content, languageId, selection }
```

### Get the User's Selection
```typescript
const editor = vscode.window.activeTextEditor;
if (editor && !editor.selection.isEmpty) {
    const selectedText = editor.document.getText(editor.selection);
    const startLine = editor.selection.start.line;
    const endLine = editor.selection.end.line;
}

// Via MCP
// Tool: tarx_ui_editor_get_selection
```

### Get Workspace Files
```typescript
// Get workspace folders
const workspaceFolders = vscode.workspace.workspaceFolders;
const rootPath = workspaceFolders?.[0]?.uri.fsPath;

// Find files by pattern
const files = await vscode.workspace.findFiles('**/*.ts', '**/node_modules/**');

// Read directory
const entries = await vscode.workspace.fs.readDirectory(uri);

// Via MCP
// Tool: tarx_ui_explorer_get_tree with depth parameter
```

### Get Git Status
```typescript
// Via commands (the git extension provides these)
await vscode.commands.executeCommand('git.refresh');
const gitExtension = vscode.extensions.getExtension('vscode.git');
const git = gitExtension?.exports?.getAPI(1);
const repo = git?.repositories[0];
const changes = repo?.state.workingTreeChanges;

// Via MCP
// Tool: tarx_ui_scm_get_changes
```

### Get Terminal Output
```typescript
// Note: VS Code doesn't expose terminal output directly
// Use onDidWriteTerminalData if available (proposed API)

// Via MCP - can read terminal state
// Tool: tarx_ui_terminal_get_state
```

### Get Diagnostics (Errors/Warnings)
```typescript
// Get all diagnostics for a file
const diagnostics = vscode.languages.getDiagnostics(uri);

// Get all diagnostics in workspace
const allDiagnostics = vscode.languages.getDiagnostics();

// Listen for changes
vscode.languages.onDidChangeDiagnostics(event => {
    for (const uri of event.uris) {
        const diags = vscode.languages.getDiagnostics(uri);
        // Process diagnostics
    }
});

// Via MCP
// Tool: tarx_ui_editor_get_diagnostics
```

---

## Section 3: Taking Action

### Edit Files
```typescript
// Method 1: TextEditor.edit (for open files)
const editor = vscode.window.activeTextEditor;
await editor.edit(editBuilder => {
    // Insert at position
    editBuilder.insert(new vscode.Position(0, 0), 'Hello\n');

    // Replace range
    editBuilder.replace(selection, 'New text');

    // Delete range
    editBuilder.delete(range);
});

// Method 2: WorkspaceEdit (for any file, even closed)
const edit = new vscode.WorkspaceEdit();
edit.replace(uri, range, 'New content');
edit.insert(uri, position, 'Inserted text');
edit.delete(uri, range);
await vscode.workspace.applyEdit(edit);

// Method 3: Direct file write
await vscode.workspace.fs.writeFile(uri, Buffer.from(content));

// Via MCP
// Tools: tarx_ui_editor_replace_text, tarx_ui_editor_insert_text
```

### Run Terminal Commands
```typescript
// Create and run
const terminal = vscode.window.createTerminal({
    name: 'TARX Task',
    cwd: workspacePath,
    env: { ...process.env, TARX_MODE: 'agentic' }
});
terminal.show();
terminal.sendText('npm test', true); // true = add newline

// Via MCP
// Tool: tarx_ui_terminal_send_command
```

### Show Diagnostics
```typescript
// Create a diagnostic collection (do this once at activation)
const diagnosticCollection = vscode.languages.createDiagnosticCollection('tarx');

// Add diagnostics
const diagnostic = new vscode.Diagnostic(
    new vscode.Range(10, 0, 10, 50), // line 10
    'TARX: This function could be optimized',
    vscode.DiagnosticSeverity.Warning // or Error, Information, Hint
);
diagnostic.source = 'TARX';
diagnostic.code = 'TARX001';

diagnosticCollection.set(uri, [diagnostic]);

// Clear diagnostics
diagnosticCollection.clear();
```

**Note:** TARX currently does NOT have this implemented. This is a gap.

### Provide Inline Completions
```typescript
// Register provider (already done in extension.ts:2055)
vscode.languages.registerInlineCompletionItemProvider(
    { pattern: '**/*' },
    {
        provideInlineCompletionItems(document, position, context, token) {
            const item = new vscode.InlineCompletionItem(
                'suggested code here',
                new vscode.Range(position, position)
            );
            return [item];
        }
    }
);
```

### Open Files
```typescript
// Open in editor
const doc = await vscode.workspace.openTextDocument(uri);
await vscode.window.showTextDocument(doc);

// Open to specific line
await vscode.window.showTextDocument(doc, {
    selection: new vscode.Range(line, 0, line, 0)
});

// Via MCP
// Tool: tarx_ui_editor_open_file
```

### Create Notifications
```typescript
// Simple
vscode.window.showInformationMessage('Task complete!');

// With actions
const choice = await vscode.window.showInformationMessage(
    'Apply this fix?',
    'Yes', 'No', 'Show Diff'
);
if (choice === 'Yes') {
    // Apply fix
}

// Progress
await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'TARX is analyzing...',
    cancellable: true
}, async (progress, token) => {
    progress.report({ increment: 50 });
    // Do work
    progress.report({ increment: 100 });
});

// Via MCP
// Tools: tarx_ui_notification_show_info, tarx_ui_notification_show_progress
```

### Trigger Tasks
```typescript
// Execute a task by name
const tasks = await vscode.tasks.fetchTasks();
const testTask = tasks.find(t => t.name === 'test');
if (testTask) {
    await vscode.tasks.executeTask(testTask);
}

// Run a command
await vscode.commands.executeCommand('workbench.action.tasks.runTask', 'npm: test');
```

**Note:** TARX doesn't register a TaskProvider yet. This is a gap.

---

## Section 4: Agentic Patterns

### Pattern 1: Answer Questions About Code
```
User asks question about code
         ↓
1. Get active file (activeTextEditor)
2. Get selection if any
3. Parse file references from question
4. Load RAG context for semantic search
5. Build system prompt with all context
6. Send to LLM
7. Stream response to chat
```

**Implementation:** `extensions/tarx/src/extension.ts:1161-1750`

### Pattern 2: Fix This (Error Resolution)
```
User says "fix this" or highlights error
         ↓
1. Get current diagnostics (vscode.languages.getDiagnostics)
2. Get surrounding code context
3. Send to LLM with error details
4. Parse code blocks from response
5. Apply via applyArtifactSafe() or WorkspaceEdit
6. Re-run diagnostics to verify
```

**Implementation:** `extensions/tarx/src/limit-patch.ts:744` (applyArtifactSafe)

### Pattern 3: File Upload → RAG Index
```
User uploads file via sidebar
         ↓
1. Receive file in webview
2. Send to tarx-core MCP (tarx_upload_file)
3. Auto-generate embeddings (generateEmbeddings: true)
4. Store in SQLite with space_id
5. Confirm to user
6. Available for future semantic search
```

**Implementation:** `extensions/tarx-core/src/files.ts`

### Pattern 4: Proactive Analysis (Watch Mode)
```
User saves file
         ↓
1. onDidSaveTextDocument fires
2. Get file diagnostics
3. If new errors: suggest fix
4. If patterns detected: suggest refactor
5. Show notification with action button
```

**Note:** NOT YET IMPLEMENTED. Requires onDidSaveTextDocument hook.

### Pattern 5: Multi-Step Task Execution
```
User requests complex task
         ↓
1. Parse into sub-tasks
2. For each sub-task:
   a. Execute action (file edit, terminal command, etc.)
   b. Verify success (check diagnostics, exit code)
   c. Report progress
3. Aggregate results
4. Report completion
```

**Current Limitation:** No tool use/function calling. LLM cannot execute tools directly.

### Pattern 6: Claude Code Integration
```
User triggers Claude Code (Ctrl+Shift+;)
         ↓
1. Create terminal with name "Claude Code CLI"
2. Set TARX_WORKSPACE environment variable
3. Send: claude -p '<prompt>' --dangerously-skip-permissions
4. User interacts directly in terminal
```

**Implementation:** `extensions/tarx/src/extension.ts:2190-2250`

---

## Section 5: What You Can't Do Yet (Roadmap)

### Missing Capabilities

| Capability | Status | Required API | Priority |
|------------|--------|--------------|----------|
| Create diagnostics | NO | `vscode.languages.createDiagnosticCollection` | P1 |
| React to file saves | NO | `vscode.workspace.onDidSaveTextDocument` | P1 |
| Quick fix lightbulbs | NO | `vscode.languages.registerCodeActionsProvider` | P1 |
| Tool use in chat | NO | Custom implementation | CRITICAL |
| VS Code tasks | NO | `vscode.tasks.registerTaskProvider` | P2 |
| Autocomplete | NO | `vscode.languages.registerCompletionItemProvider` | P2 |

### How to Add DiagnosticCollection
```typescript
// In extension.ts activate():
const tarxDiagnostics = vscode.languages.createDiagnosticCollection('tarx');
context.subscriptions.push(tarxDiagnostics);

// When AI detects an issue:
function showAIDiagnostic(uri: vscode.Uri, line: number, message: string) {
    const diagnostic = new vscode.Diagnostic(
        new vscode.Range(line, 0, line, 1000),
        `TARX: ${message}`,
        vscode.DiagnosticSeverity.Information
    );
    diagnostic.source = 'TARX AI';
    tarxDiagnostics.set(uri, [diagnostic]);
}
```

### How to Add Save Hooks
```typescript
// In extension.ts activate():
vscode.workspace.onDidSaveTextDocument(async (document) => {
    // Skip non-code files
    if (!['typescript', 'javascript', 'python'].includes(document.languageId)) {
        return;
    }

    // Get diagnostics
    const diagnostics = vscode.languages.getDiagnostics(document.uri);
    const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error);

    if (errors.length > 0) {
        const fix = await vscode.window.showInformationMessage(
            `TARX detected ${errors.length} errors. Want me to fix them?`,
            'Yes', 'No'
        );
        if (fix === 'Yes') {
            // Trigger fix flow
        }
    }
});
```

### How to Add Tool Use
```typescript
// In chat handler, after getting LLM response:
interface ToolCall {
    name: string;
    arguments: Record<string, unknown>;
}

// Parse tool calls from response (if model supports it)
const toolCalls = parseToolCalls(response);

for (const call of toolCalls) {
    switch (call.name) {
        case 'read_file':
            const content = await vscode.workspace.fs.readFile(
                vscode.Uri.file(call.arguments.path as string)
            );
            // Inject result back into conversation
            break;
        case 'write_file':
            await vscode.workspace.fs.writeFile(
                vscode.Uri.file(call.arguments.path as string),
                Buffer.from(call.arguments.content as string)
            );
            break;
        case 'run_terminal':
            const terminal = vscode.window.createTerminal({ name: 'TARX Tool' });
            terminal.sendText(call.arguments.command as string);
            break;
    }
}
```

---

## Section 6: Quick Reference

### Commands to Register
```typescript
vscode.commands.registerCommand('tarx.fixThis', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
    // ... fix logic
});
```

### Event Subscriptions
```typescript
// Document changes
vscode.workspace.onDidChangeTextDocument(e => { /* ... */ });

// Document saves
vscode.workspace.onDidSaveTextDocument(doc => { /* ... */ });

// Active editor changes
vscode.window.onDidChangeActiveTextEditor(editor => { /* ... */ });

// Configuration changes
vscode.workspace.onDidChangeConfiguration(e => { /* ... */ });

// Diagnostic changes
vscode.languages.onDidChangeDiagnostics(e => { /* ... */ });

// Terminal data
vscode.window.onDidWriteTerminalData?.(e => { /* ... */ }); // Proposed API
```

### Status Bar
```typescript
const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
);
statusBar.text = '$(tarx-icon) TARX';
statusBar.tooltip = 'TARX AI Assistant';
statusBar.command = 'tarx.showStatus';
statusBar.show();
```

### Context Keys (for when clauses)
```typescript
// Set context
vscode.commands.executeCommand('setContext', 'tarx.hasActiveProject', true);

// Use in package.json
"when": "tarx.hasActiveProject && editorTextFocus"
```

---

## Appendix: File Locations

| Purpose | Location |
|---------|----------|
| Main extension entry | `extensions/tarx/src/extension.ts` |
| Chat participant | `extensions/tarx/src/extension.ts:1161` |
| Inline completions | `extensions/tarx/src/completionProvider.ts` |
| Sidebar webview | `extensions/tarx/src/webview/TarxSidebarProvider.ts` |
| System prompts | `extensions/tarx/src/systemPrompt.ts` |
| RAG client | `extensions/tarx/src/services/ragClient.ts` |
| Database | `extensions/tarx/src/services/database.ts` |
| Code apply | `extensions/tarx/src/limit-patch.ts` |
| MCP core tools | `extensions/tarx-core/src/tools/` |
| MCP ops tools | `extensions/tarx-ops/src/tools/` |
| MCP UI tools | `extensions/tarx-ui-mcp-server/src/tools/` |
