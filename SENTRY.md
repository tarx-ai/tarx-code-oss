# Workbench Sentry Integration

Error tracking and crash reporting for Workbench-OSS.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Workbench-OSS                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────┐    ┌─────────────────────┐        │
│  │   Main Process      │    │   Renderer Process  │        │
│  │   (electron-main)   │    │   (workbench)       │        │
│  │                     │    │                     │        │
│  │  • Startup errors   │    │  • UI errors        │        │
│  │  • Native crashes   │    │  • Unhandled errors │        │
│  │  • IPC errors       │    │  • Promise rejects  │        │
│  └─────────────────────┘    └─────────────────────┘        │
│            │                          │                     │
│  ┌─────────────────────┐              │                     │
│  │  Extension Host     │              │                     │
│  │  (node process)     │              │                     │
│  │                     │              │                     │
│  │  • Extension errors │              │                     │
│  │  • API errors       │              │                     │
│  └─────────────────────┘              │                     │
│            │                          │                     │
│            └──────────┬───────────────┘                     │
│                       ▼                                     │
│              Sentry Dashboard                               │
│         sentry.io/organizations/tarx-fo                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Configuration

### Environment Variables

```bash
# Override default Sentry DSN (optional)
TARX_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

# Set to 'production' for production builds
NODE_ENV=production

# Sentry CLI (for source map uploads in CI/CD)
SENTRY_ORG=tarx-fo
SENTRY_PROJECT=workbench
SENTRY_AUTH_TOKEN=sntrys_xxx  # Get from Sentry > Settings > Auth Tokens
```

### Default DSN

The default DSN is configured in `src/vs/platform/sentry/common/sentry.ts`:
- Org: `tarx-fo`
- Project: `workbench` (Electron)
- Project ID: `4510756453679104`

## File Structure

| File | Purpose |
|------|---------|
| `src/vs/platform/sentry/common/sentry.ts` | Interface definitions and DSN |
| `src/vs/platform/sentry/electron-main/sentryMainService.ts` | Main process service |
| `src/vs/platform/sentry/browser/sentryBrowserService.ts` | Renderer process service |
| `src/vs/code/electron-main/main.ts` | Main process initialization |
| `src/vs/workbench/electron-browser/desktop.main.ts` | Renderer process initialization |
| `src/vs/workbench/browser/workbench.ts` | Error handler integration |
| `src/vs/workbench/api/node/extensionHostProcess.ts` | Extension host initialization |

## Features

- ✅ Main process error tracking
- ✅ Renderer process error tracking
- ✅ Extension host error tracking
- ✅ Unhandled promise rejection capture
- ✅ Window error capture
- ✅ Performance tracing (100% in dev, 10% in production)
- ✅ PII filtering (no emails, no IP addresses)
- ✅ Noisy error filtering (ResizeObserver, network errors, etc.)
- ✅ **AI Agent Monitoring** (manual instrumentation)

## AI Agent Monitoring

Workbench includes Sentry AI Agent Monitoring for tracking AI/LLM calls.

### Configuration

AI monitoring is enabled by default with:
- `tracesSampleRate: 1.0` (required for AI monitoring)
- `sendDefaultPii: true` (captures inputs/outputs)

### Usage

Import the AI monitoring utilities:

```typescript
import {
  traceAIRequest,
  traceAIAgent,
  traceAITool,
  traceAIHandoff,
  addAIBreadcrumb
} from '../../platform/sentry/common/aiMonitoring.js';
```

### Trace an LLM Request

```typescript
const result = await traceAIRequest(
  { model: 'llama-3.2-3b', inputTokens: 100 },
  async (span) => {
    const response = await llmCall(prompt);
    span.setAttribute('gen_ai.usage.output_tokens', response.tokens);
    return response;
  }
);
```

### Trace an Agent Invocation

```typescript
const result = await traceAIAgent(
  { agentName: 'tarx', model: 'llama-3.2-3b', tools: ['search', 'code'] },
  async (span) => {
    return await agent.run(userMessage);
  }
);
```

### Trace a Tool Execution

```typescript
const result = await traceAITool(
  { toolName: 'search', input: { query: 'hello' } },
  async () => {
    return await searchTool.execute(query);
  }
);
```

### Record Agent Handoff

```typescript
traceAIHandoff('router', 'coder');
```

### Span Attributes

| Span Type | Op | Required Attributes |
|-----------|----|--------------------|
| LLM Request | `gen_ai.request` | `gen_ai.request.model` |
| Agent Invoke | `gen_ai.invoke_agent` | `gen_ai.agent.name`, `gen_ai.request.model` |
| Tool Execute | `gen_ai.execute_tool` | `gen_ai.tool.name` |
| Handoff | `gen_ai.handoff` | - |

### Dashboard

View AI traces at: https://tarx-fo.sentry.io/insights/ai/

## Testing

### Verify Integration

1. Start Code-OSS:
   ```bash
   ./scripts/code.sh
   ```

2. Check console for Sentry initialization:
   ```
   [Sentry] Main process initialized
   [Sentry] Renderer process initialized
   ```

3. Trigger test errors (in DevTools console):
   ```javascript
   // Manual test error
   throw new Error('TARX CODE V1 - Manual Test Error');
   ```

4. Check Sentry dashboard:
   - https://sentry.io/organizations/tarx-fo/issues/

### Test Functions

The test file at `src/vs/platform/sentry/test/sentryTest.ts` provides test functions:

```typescript
// In main process (extension host)
tarxSentryTest.testMainProcessError();
tarxSentryTest.testCaptureMessage();

// In renderer (DevTools console)
tarxSentryTest.testRendererError();
```

## Source Maps

### Upload During Build

```bash
# Set auth token first
export SENTRY_AUTH_TOKEN=sntrys_xxx

# Create release and upload source maps
npm run sentry:release
npm run sentry:upload
```

### Manual Upload

```bash
# Install Sentry CLI
npm install -g @sentry/cli

# Upload source maps
sentry-cli sourcemaps upload \
  --release="tarx-code@1.0.0" \
  --org=tarx-fo \
  --project=javascript-react \
  ./out
```

## Troubleshooting

### Errors Not Appearing in Dashboard

1. Check DSN is set correctly
2. Check console for Sentry init messages
3. Check network tab for requests to `ingest.sentry.io`
4. Verify environment is not blocking Sentry requests

### Source Maps Not Working

1. Ensure `sourcemap: true` in build config
2. Check `SENTRY_AUTH_TOKEN` is set
3. Verify release version matches

## Security Notes

- DSN is safe to expose (it's a public key)
- Auth tokens (`SENTRY_AUTH_TOKEN`) must be kept secret
- PII is not sent by default
- IP addresses and emails are stripped before send

## Links

- Dashboard: https://sentry.io/organizations/tarx-fo/
- Sentry Electron Docs: https://docs.sentry.io/platforms/javascript/guides/electron/
