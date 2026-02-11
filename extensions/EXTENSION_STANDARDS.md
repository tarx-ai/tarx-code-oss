# TARX Extension Standards

Guidelines for bundled TARX extensions.

## Directory Structure

```
extensions/
├── tarx-{name}/
│   ├── assets/
│   │   ├── icon.png          # 512x512 extension icon
│   │   └── icon-small.png    # 64x64 for toolbars
│   ├── src/
│   │   ├── server.ts         # MCP server entry point
│   │   ├── database.ts       # Database operations (if needed)
│   │   └── ...
│   ├── dist/                  # Compiled output
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md
```

## Naming Conventions

- **Package name**: `tarx-{target}-{feature}`
  - `tarx-claude-memory` - Memory for Claude
  - `tarx-openai-memory` - Memory for ChatGPT
  - `tarx-local-inference` - Local LLM tools

- **Display name**: `TARX {Feature}`
  - Always capitalize "TARX"
  - Feature name in title case

- **Tool names**: `{feature}_{action}`
  - `memory_store`
  - `memory_search`
  - `inference_chat`

## Branding

### Logo
- Use official TARX logo from `~/Desktop/TARX.png`
- Do NOT use gradient or modified versions
- Maintain aspect ratio

### Colors
- Primary: #6366F1 (Indigo)
- Background: #0F0F23 (Dark)
- Text: #FFFFFF

### Copy
- Always spell "TARX" in all caps
- Tagline: "Local. Private. Proactive."
- Description should start with what it does, not marketing

## Package.json Requirements

```json
{
  "name": "tarx-{name}",
  "displayName": "TARX {Feature}",
  "version": "1.0.0",
  "description": "Clear, concise description",
  "author": "TARX",
  "license": "MIT",
  "icon": "assets/icon.png",
  "main": "dist/server.js",
  "mcp": {
    "name": "TARX {Feature}",
    "description": "MCP description",
    "icon": "assets/icon.png",
    "tools": ["tool_1", "tool_2"]
  }
}
```

## Database

- Use shared TARX database: `~/Library/Application Support/tarx/memory.db`
- Use WAL mode for concurrency
- Create tables with `IF NOT EXISTS`
- Always include `deleted_at` for soft deletes
- Include `created_at` and `updated_at` timestamps

## Error Handling

- Return structured JSON for all tool responses
- Include `success: boolean` in all responses
- Include descriptive `error` message on failure
- Never crash - catch and return errors gracefully

## Testing

- Test with Claude Desktop before release
- Verify tools appear in Claude's tool list
- Test each tool individually
- Test error cases

## Release Checklist

- [ ] `npm run build` succeeds
- [ ] `npm start` runs without errors
- [ ] Icon displays correctly in Claude
- [ ] All tools functional
- [ ] README updated
- [ ] Version bumped in package.json
