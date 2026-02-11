# TARX UI MCP Server v2.0.0 — Tool Reference

## Overview

- **Total tools**: 177
- **Modules**: 18
- **Test cases**: 2,500 across 13 categories
- **Transport**: stdio (JSON-RPC over stdin/stdout)
- **Harness**: HTTP bridge at `localhost:11439` (configurable via `TARX_UI_HARNESS_URL`)
- **Build**: `npm run build` → `dist/server.js` (~100KB, esbuild ESM bundle)

## Quick Start

### Connect via MCP

Add to `~/.claude.json`:
```json
{
  "mcpServers": {
    "tarx-ui-mcp-server": {
      "command": "node",
      "args": ["/path/to/extensions/tarx-ui-mcp-server/dist/server.js"]
    }
  }
}
```

### Run Tests
```
tarx_ui_test_run_all          — Run all 2,500 tests
tarx_ui_test_run_category     — Run tests for one module (e.g., "editor")
tarx_ui_test_run_single       — Run one test by ID (e.g., "A-001")
tarx_ui_test_run_suite        — Run tests by tag or category
```

### Screenshot + OCR
```
tarx_ui_screenshot_full       — Full window capture
tarx_ui_screenshot_region     — Capture sidebar/editor/panel/chat
tarx_ui_screenshot_ocr        — Extract text from image
tarx_ui_screenshot_ocr_region — OCR a specific screen region
tarx_ui_screenshot_find_text  — Find text coordinates on screen
```

---

## Tool Catalog by Module

### Legacy (9 tools)

| Tool | Params | Description | R/W |
|------|--------|-------------|-----|
| `tarx_ui_get_status` | — | Get TARX app status (inference connection, errors) | R |
| `tarx_ui_send_chat` | message, waitForResponse?, timeoutMs?, directMode? | Send chat message, capture response | W |
| `tarx_ui_read_chat` | messageCount? | Read recent chat messages | R |
| `tarx_ui_capture_error` | — | Read current error state | R |
| `tarx_ui_start_voice` | durationMs? | Trigger voice input | W |
| `tarx_ui_create_conversation` | title?, projectId? | Create new conversation | W |
| `tarx_ui_select_project` | projectName | Select sidebar project | W |
| `tarx_ui_screenshot` | region? | Capture screenshot (full/chat/sidebar/input) | R |
| `tarx_ui_server_status` | — | Get MCP server status and config | R |

### Editor (18 tools)

| Tool | Params | Description | R/W |
|------|--------|-------------|-----|
| `tarx_ui_editor_open_file` | filePath, viewColumn?, preview? | Open file in editor | W |
| `tarx_ui_editor_close_file` | filePath? | Close editor tab | W |
| `tarx_ui_editor_close_all` | — | Close all editor tabs | W |
| `tarx_ui_editor_get_active` | — | Get active editor info | R |
| `tarx_ui_editor_get_tabs` | — | List open editor tabs | R |
| `tarx_ui_editor_select_tab` | filePath | Switch to editor tab | W |
| `tarx_ui_editor_type_text` | text | Type at cursor position | W |
| `tarx_ui_editor_insert_text` | text, line, column? | Insert at position | W |
| `tarx_ui_editor_replace_text` | startLine, startColumn, endLine, endColumn, newText | Replace text range | W |
| `tarx_ui_editor_select_range` | startLine, startColumn, endLine, endColumn | Select text range | W |
| `tarx_ui_editor_get_selection` | — | Get selected text | R |
| `tarx_ui_editor_go_to_line` | line, column? | Navigate to line | W |
| `tarx_ui_editor_fold` | line? | Fold code at line | W |
| `tarx_ui_editor_unfold` | line? | Unfold code at line | W |
| `tarx_ui_editor_add_decoration` | startLine, endLine, color?, tag? | Add line decoration | W |
| `tarx_ui_editor_clear_decorations` | tag? | Clear decorations | W |
| `tarx_ui_editor_get_diagnostics` | filePath?, severity? | Get errors/warnings | R |
| `tarx_ui_editor_trigger_suggest` | — | Trigger IntelliSense | W |

### Terminal (12 tools)

| Tool | Params | Description | R/W |
|------|--------|-------------|-----|
| `tarx_ui_terminal_create` | name?, cwd?, shellPath? | Create terminal | W |
| `tarx_ui_terminal_send_command` | command, terminalId?, addNewLine? | Send command | W |
| `tarx_ui_terminal_list` | — | List terminals | R |
| `tarx_ui_terminal_select` | terminalId | Focus terminal | W |
| `tarx_ui_terminal_close` | terminalId? | Close terminal | W |
| `tarx_ui_terminal_close_all` | — | Close all terminals | W |
| `tarx_ui_terminal_get_state` | terminalId? | Get terminal state | R |
| `tarx_ui_terminal_split` | — | Split active terminal | W |
| `tarx_ui_terminal_rename` | terminalId?, name | Rename terminal | W |
| `tarx_ui_terminal_show` | — | Show terminal panel | W |
| `tarx_ui_terminal_hide` | — | Hide terminal panel | W |
| `tarx_ui_terminal_set_profile` | profileName | Set default profile | W |

### Panels & Layout (14 tools)

| Tool | Params | Description | R/W |
|------|--------|-------------|-----|
| `tarx_ui_panel_show` | panel? | Show bottom panel | W |
| `tarx_ui_panel_hide` | — | Hide bottom panel | W |
| `tarx_ui_panel_toggle` | — | Toggle bottom panel | W |
| `tarx_ui_panel_get_state` | — | Get panel state | R |
| `tarx_ui_sidebar_show` | viewId? | Show primary sidebar | W |
| `tarx_ui_sidebar_hide` | — | Hide primary sidebar | W |
| `tarx_ui_sidebar_toggle` | — | Toggle primary sidebar | W |
| `tarx_ui_sidebar_get_state` | — | Get sidebar state | R |
| `tarx_ui_view_open` | viewId | Open specific view | W |
| `tarx_ui_view_close` | viewId | Close specific view | W |
| `tarx_ui_view_focus` | viewId | Focus specific view | W |
| `tarx_ui_secondary_sidebar_toggle` | — | Toggle secondary sidebar | W |
| `tarx_ui_layout_get` | — | Get editor layout | R |
| `tarx_ui_layout_set` | layout | Set editor layout | W |

### Notifications & Dialogs (10 tools)

| Tool | Params | Description | R/W |
|------|--------|-------------|-----|
| `tarx_ui_notification_show_info` | message, actions? | Show info notification | W |
| `tarx_ui_notification_show_warning` | message, actions? | Show warning notification | W |
| `tarx_ui_notification_show_error` | message, actions? | Show error notification | W |
| `tarx_ui_notification_show_progress` | title, increment?, cancellable? | Show progress notification | W |
| `tarx_ui_notification_dismiss_all` | — | Dismiss all notifications | W |
| `tarx_ui_notification_get_visible` | — | Get visible notifications | R |
| `tarx_ui_dialog_input` | prompt, placeholder?, value?, password? | Show input dialog | W |
| `tarx_ui_dialog_quickpick` | items, placeholder?, canPickMany? | Show quick pick | W |
| `tarx_ui_dialog_message` | message, detail?, modal?, actions? | Show message dialog | W |
| `tarx_ui_status_message` | text, durationMs? | Show status bar message | W |

### TARX Sidebar (16 tools)

| Tool | Params | Description | R/W |
|------|--------|-------------|-----|
| `tarx_ui_sidebar_get_full_state` | — | Get complete sidebar state | R |
| `tarx_ui_sidebar_do_action` | action, projectId?, conversationId?, sessionId?, spaceId?, name?, instructions?, fileId? | Execute sidebar action | W |
| `tarx_ui_sidebar_toggle_section` | section | Toggle section collapse | W |
| `tarx_ui_sidebar_get_projects` | — | Get all projects | R |
| `tarx_ui_sidebar_get_history` | limit? | Get conversation history | R |
| `tarx_ui_sidebar_get_files` | — | Get uploaded files | R |
| `tarx_ui_sidebar_search_history` | query | Search conversations | R |
| `tarx_ui_sidebar_delete_history` | itemId | Delete conversation | W |
| `tarx_ui_sidebar_navigate_to` | view, projectId? | Navigate to view | W |
| `tarx_ui_sidebar_open_settings` | — | Open settings panel | W |
| `tarx_ui_sidebar_get_settings` | — | Get TARX settings | R |
| `tarx_ui_sidebar_update_settings` | key, value | Update setting | W |
| `tarx_ui_sidebar_connection_status` | — | Get connection status | R |
| `tarx_ui_sidebar_collapse` | — | Collapse all sections | W |
| `tarx_ui_sidebar_expand` | — | Expand all sections | W |
| `tarx_ui_sidebar_refresh` | — | Force refresh all data | W |

### Chat (12 tools)

| Tool | Params | Description | R/W |
|------|--------|-------------|-----|
| `tarx_ui_chat_open` | — | Open chat panel | W |
| `tarx_ui_chat_close` | — | Close chat panel | W |
| `tarx_ui_chat_new` | — | New chat conversation | W |
| `tarx_ui_chat_send_enhanced` | message, participant?, attachFiles? | Send with targeting | W |
| `tarx_ui_chat_read_enhanced` | count?, includeMetadata? | Read with metadata | R |
| `tarx_ui_chat_clear` | — | Clear chat history | W |
| `tarx_ui_chat_get_state` | — | Get chat panel state | R |
| `tarx_ui_chat_select_participant` | participant | Select participant | W |
| `tarx_ui_chat_get_participants` | — | List participants | R |
| `tarx_ui_chat_attach_file` | filePath | Attach file to chat | W |
| `tarx_ui_chat_attach_selection` | — | Attach editor selection | W |
| `tarx_ui_chat_inline_start` | message? | Start inline chat | W |

### Commands & Quick Open (8 tools)

| Tool | Params | Description | R/W |
|------|--------|-------------|-----|
| `tarx_ui_command_execute` | command, args? | Execute VS Code command | W |
| `tarx_ui_command_list` | filter? | List all commands | R |
| `tarx_ui_command_search` | query | Search commands | R |
| `tarx_ui_command_palette_open` | — | Open command palette | W |
| `tarx_ui_command_palette_type` | text | Type into palette | W |
| `tarx_ui_quickopen_open` | — | Open Quick Open | W |
| `tarx_ui_quickopen_type` | text | Type into Quick Open | W |
| `tarx_ui_quickopen_select` | index? | Select Quick Open item | W |

### Explorer (12 tools)

| Tool | Params | Description | R/W |
|------|--------|-------------|-----|
| `tarx_ui_explorer_open` | — | Open file explorer | W |
| `tarx_ui_explorer_get_tree` | path?, depth? | Get file tree | R |
| `tarx_ui_explorer_expand_folder` | path | Expand folder | W |
| `tarx_ui_explorer_collapse_folder` | path | Collapse folder | W |
| `tarx_ui_explorer_select_file` | path | Select file | W |
| `tarx_ui_explorer_reveal_file` | path | Reveal and scroll to file | W |
| `tarx_ui_explorer_create_file` | path, content? | Create file | W |
| `tarx_ui_explorer_create_folder` | path | Create folder | W |
| `tarx_ui_explorer_delete` | path, recursive? | Delete file/folder | W |
| `tarx_ui_explorer_rename` | oldPath, newPath | Rename file/folder | W |
| `tarx_ui_explorer_copy` | sourcePath, destinationPath | Copy file/folder | W |
| `tarx_ui_explorer_get_workspace` | — | Get workspace info | R |

### Source Control (8 tools)

| Tool | Params | Description | R/W |
|------|--------|-------------|-----|
| `tarx_ui_scm_open` | — | Open Source Control view | W |
| `tarx_ui_scm_get_changes` | — | Get git changes | R |
| `tarx_ui_scm_stage_file` | filePath | Stage file | W |
| `tarx_ui_scm_unstage_file` | filePath | Unstage file | W |
| `tarx_ui_scm_stage_all` | — | Stage all changes | W |
| `tarx_ui_scm_commit` | message | Create commit | W |
| `tarx_ui_scm_discard` | filePath | Discard changes | W |
| `tarx_ui_scm_get_branch` | — | Get branch info | R |

### Debug (8 tools)

| Tool | Params | Description | R/W |
|------|--------|-------------|-----|
| `tarx_ui_debug_open` | — | Open Debug view | W |
| `tarx_ui_debug_start` | configuration? | Start debug session | W |
| `tarx_ui_debug_stop` | — | Stop debug session | W |
| `tarx_ui_debug_pause` | — | Pause debug session | W |
| `tarx_ui_debug_continue` | — | Continue execution | W |
| `tarx_ui_debug_step_over` | — | Step over | W |
| `tarx_ui_debug_step_into` | — | Step into | W |
| `tarx_ui_debug_get_state` | — | Get debug state | R |

### Extensions (6 tools)

| Tool | Params | Description | R/W |
|------|--------|-------------|-----|
| `tarx_ui_extensions_open` | — | Open Extensions view | W |
| `tarx_ui_extensions_list_installed` | — | List installed extensions | R |
| `tarx_ui_extensions_search` | query | Search marketplace | R |
| `tarx_ui_extensions_install` | extensionId | Install extension | W |
| `tarx_ui_extensions_uninstall` | extensionId | Uninstall extension | W |
| `tarx_ui_extensions_enable_disable` | extensionId, enable | Enable/disable extension | W |

### Settings (8 tools)

| Tool | Params | Description | R/W |
|------|--------|-------------|-----|
| `tarx_ui_settings_open_ui` | — | Open Settings UI | W |
| `tarx_ui_settings_open_json` | — | Open settings.json | W |
| `tarx_ui_settings_get` | key | Get setting value | R |
| `tarx_ui_settings_set` | key, value, target? | Set setting value | W |
| `tarx_ui_settings_search` | query | Search settings | R |
| `tarx_ui_settings_reset` | key | Reset to default | W |
| `tarx_ui_keybindings_open` | — | Open Keyboard Shortcuts | W |
| `tarx_ui_keybindings_get` | command | Get keybinding | R |

### Screenshot & OCR (8 tools)

| Tool | Params | Description | R/W |
|------|--------|-------------|-----|
| `tarx_ui_screenshot_full` | format? | Full window screenshot | R |
| `tarx_ui_screenshot_region` | region | Region screenshot (sidebar/editor/panel/statusbar/titlebar/chat) | R |
| `tarx_ui_screenshot_compare` | baselinePath, currentPath, threshold? | Visual diff comparison | R |
| `tarx_ui_screenshot_ocr` | imagePath | OCR text extraction | R |
| `tarx_ui_screenshot_ocr_region` | region | OCR a screen region | R |
| `tarx_ui_screenshot_find_text` | text, caseSensitive? | Find text coordinates | R |
| `tarx_ui_screenshot_verify_element` | expectedText[], region? | Verify UI element by text | R |
| `tarx_ui_screenshot_list` | limit? | List captured screenshots | R |

### Window (8 tools)

| Tool | Params | Description | R/W |
|------|--------|-------------|-----|
| `tarx_ui_window_reload` | — | Reload window | W |
| `tarx_ui_window_toggle_fullscreen` | — | Toggle fullscreen | W |
| `tarx_ui_window_toggle_zen` | — | Toggle Zen Mode | W |
| `tarx_ui_window_zoom_in` | — | Zoom in | W |
| `tarx_ui_window_zoom_out` | — | Zoom out | W |
| `tarx_ui_window_zoom_reset` | — | Reset zoom | W |
| `tarx_ui_window_workspace_open` | path, newWindow? | Open workspace/folder | W |
| `tarx_ui_window_workspace_add_folder` | path | Add folder to workspace | W |

### Status Bar (4 tools)

| Tool | Params | Description | R/W |
|------|--------|-------------|-----|
| `tarx_ui_statusbar_get_items` | — | Get status bar items | R |
| `tarx_ui_statusbar_click` | itemId | Click status bar item | W |
| `tarx_ui_statusbar_get_tarx` | — | Get TARX status item | R |
| `tarx_ui_statusbar_set_tarx` | text?, tooltip?, color? | Update TARX status item | W |

### Theme (6 tools)

| Tool | Params | Description | R/W |
|------|--------|-------------|-----|
| `tarx_ui_theme_set` | theme | Set color theme | W |
| `tarx_ui_theme_get` | — | Get current theme | R |
| `tarx_ui_theme_list` | — | List all themes | R |
| `tarx_ui_theme_icon_set` | theme | Set icon theme | W |
| `tarx_ui_theme_font_size_set` | size | Set font size | W |
| `tarx_ui_theme_font_family_set` | fontFamily | Set font family | W |

### Test Runner (10 tools)

| Tool | Params | Description | R/W |
|------|--------|-------------|-----|
| `tarx_ui_test_run_suite` | tag?, category?, chaosMode? | Run suite by tag/category | W |
| `tarx_ui_test_run_single` | testId | Run single test by ID | W |
| `tarx_ui_test_run_category` | category, priority? | Run category tests | W |
| `tarx_ui_test_run_all` | chaosMode?, screenshotOnFailure? | Run all 2,500 tests | W |
| `tarx_ui_test_get_results` | runId? | Get test results | R |
| `tarx_ui_test_get_report` | runId? | Get full test report | R |
| `tarx_ui_test_list_suites` | — | List test suites | R |
| `tarx_ui_test_list_cases` | category?, priority?, tag?, limit? | List test cases | R |
| `tarx_ui_test_reset` | — | Reset test state | W |
| `tarx_ui_test_get_coverage` | — | Get tool coverage report | R |

---

## Test Suite Structure

| ID | Category | Tests | Priority Mix |
|----|----------|-------|-------------|
| A | Editor | 350 | P0: content, P1: syntax, P2: decorations |
| B | Terminal | 200 | P0: create/send, P1: state, P2: profiles |
| C | Panels | 200 | P0: toggle, P1: layout, P2: secondary |
| D | Notifications | 150 | P0: show/dismiss, P1: progress, P2: dialogs |
| E | TARX Sidebar | 400 | P0: projects/history, P1: files, P2: settings |
| F | Chat | 300 | P0: send/read, P1: participants, P2: inline |
| G | Commands | 100 | P0: execute, P1: palette, P2: quickopen |
| H | Explorer | 200 | P0: tree/create, P1: rename/copy, P2: reveal |
| I | SCM | 100 | P0: stage/commit, P1: branch, P2: discard |
| J | Debug | 100 | P0: start/stop, P1: stepping, P2: state |
| K | Settings | 100 | P0: get/set, P1: search, P2: keybindings |
| L | Screenshot | 100 | P0: capture, P1: OCR, P2: diff |
| M | Integration | 200 | P0: cross-module workflows, P2: stress |

**Total: 2,500 test cases**

## Test Baseline

- **Date**: 2026-02-10
- **Version**: 2.0.0
- **Harness status**: Port 11439 — NOT RUNNING (tests require live harness)
- **MCP handshake**: PASS (177 tools listed)
- **Build**: PASS (dist/server.js 100KB)

> Tests cannot be executed without the UI test harness on port 11439.
> Start TARX Workbench with the test harness enabled to run the suite.

---

## Common Patterns

### Take screenshot and verify UI state
```
1. tarx_ui_screenshot_region { region: "sidebar" }
2. tarx_ui_screenshot_ocr { imagePath: "<path from step 1>" }
3. Check OCR text contains expected strings
```

### Interact with chat programmatically
```
1. tarx_ui_chat_open
2. tarx_ui_chat_send_enhanced { message: "hello", participant: "@tarx" }
3. tarx_ui_chat_read_enhanced { count: 1, includeMetadata: true }
```

### Test sidebar state
```
1. tarx_ui_sidebar_get_full_state  — complete snapshot
2. tarx_ui_sidebar_get_projects    — just projects
3. tarx_ui_sidebar_connection_status — health check
```

### Run a single test category
```
tarx_ui_test_run_category { category: "editor", priority: "P0" }
tarx_ui_test_get_report
```

### Chaos mode (resilience testing)
```
tarx_ui_test_run_all { chaosMode: true, screenshotOnFailure: true }
```
Chaos mode injects random window actions (zoom, fullscreen, toggle panels) every 10 tests.

---

## Architecture

```
MCP Client (Claude Desktop / Claude Code)
    ↓ stdio (JSON-RPC)
[server.ts] McpServer + StdioServerTransport
    ↓ registerAllTools() → 177 tools
[tools/*.ts] Tool handlers
    ↓ harnessRequest() → HTTP
Test Harness (localhost:11439)
    ↓ VS Code Extension Host API
TARX Workbench UI
```

**Key files**:
- `src/server.ts` — MCP server entry, harness HTTP client
- `src/tools/index.ts` — Module registry, `registerAllTools()`
- `src/tools/types.ts` — `HarnessRequestFn`, `HarnessResponse<T>`
- `src/tests/runner.ts` — Test execution engine with chaos mode
- `src/tests/index.ts` — Test category registry (lazy loaded)
- `src/tests/types.ts` — `TestCase`, `TestStep`, `TestResult`, `TestRunReport`
- `tools/tarx-ocr` — Swift binary for macOS Vision OCR (arm64)

---

*Generated 2026-02-10 — TARX UI MCP Server v2.0.0*
