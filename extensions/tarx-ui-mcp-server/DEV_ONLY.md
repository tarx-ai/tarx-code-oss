# TARX UI MCP Server - Development/QA Only

**Status:** DEV/QA tooling, not production

## Purpose

This server provides 177 MCP tools for full VS Code UI automation and testing. It connects to a test harness on port 11439 and enables:

- Full UI control (editor, terminal, panels, sidebar)
- Screenshot capture with OCR
- Automated test execution (2500+ test cases)
- Theme and window management

## NOT for Production

These tools are meant for:
- QA automation
- UI testing
- Development debugging
- Screenshot verification

They are NOT meant for end-user production use.

## Production UI Tools

The following 9 tools are conceptually "production" UI capabilities (may exist elsewhere):

| Tool | Description | Exists? |
|------|-------------|---------|
| tarx_ui_get_theme | Get current theme | Yes (tarx_ui_theme_get) |
| tarx_ui_get_layout | Get current layout | Yes (tarx_ui_layout_get) |
| tarx_ui_set_panel | Set panel visibility | Yes (tarx_ui_panel_show/hide) |
| tarx_ui_notify | Show notification | Yes (tarx_ui_notification_show_*) |
| tarx_ui_progress | Show progress | Yes (tarx_ui_notification_show_progress) |
| tarx_ui_prompt | Show input prompt | Yes (tarx_ui_dialog_input) |
| tarx_ui_open_file | Open file in editor | Yes (tarx_ui_editor_open_file) |
| tarx_ui_terminal_run | Run terminal command | Yes (tarx_ui_terminal_send_command) |
| tarx_ui_status_bar | Update status bar | Yes (tarx_ui_statusbar_set_tarx) |

All 9 production tools have equivalents in this server.

## Tool Count

- **Total:** 177 tools
- **Categories:** 17 modules (editor, terminal, panels, notifications, sidebar, chat, commands, explorer, scm, debug, extensions, settings, screenshot, window, statusbar, theme, test-runner)

## Harness Endpoint

Default: `http://localhost:11439`

Set via: `TARX_UI_HARNESS_URL` environment variable

---

*Generated: 2026-02-12*
