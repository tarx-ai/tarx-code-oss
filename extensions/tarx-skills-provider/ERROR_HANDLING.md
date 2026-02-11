# TARX Error Handling System

## Overview

User-friendly error handling for when TARX services are down or experiencing issues.

## Architecture

### Core Components

1. **errorHandler.ts** - Centralized error classification and handling
   - `classifyError()` - Identifies error types and provides user-friendly messages
   - `showTarxError()` - Displays errors with recovery actions
   - `withRetry()` - Auto-retry wrapper with exponential backoff
   - `withErrorHandling()` - Complete error handling wrapper

2. **modelProvider.ts** - Integrated error handling for inference
   - Health checks wrapped with retry logic
   - User-friendly error messages on inference failures
   - Automatic model health status updates

3. **extension.ts** - Extension-level error handling
   - Skill execution wrapped with error handling
   - Retry command registered
   - Error feedback to users

## Error Scenarios Covered

### 1. Inference Server Down (Port 11435)
- **Code**: `INFERENCE_DOWN`
- **Message**: "TARX local AI is starting up. This usually takes ~11 seconds."
- **Actions**: Retry, Check Status

### 2. Embeddings Server Down (Port 11437)
- **Code**: `EMBEDDINGS_DOWN`
- **Message**: "Knowledge search unavailable (embedding server offline). Continuing without search."
- **Actions**: Continue, Show Status

### 3. Mesh Network Down (Port 11436)
- **Code**: `MESH_DOWN`
- **Message**: "Mesh network unavailable. Running in local-only mode."
- **Actions**: OK

### 4. Inference Timeout
- **Code**: `INFERENCE_TIMEOUT`
- **Message**: "Local inference taking longer than expected. Complex query?"
- **Actions**: Wait, Try Simpler

### 5. Server Error (HTTP 5xx)
- **Code**: `SERVER_ERROR`
- **Message**: "TARX server encountered an error. Please try again."
- **Actions**: Retry, Check Logs

### 6. Connection Failed
- **Code**: `CONNECTION_FAILED`
- **Message**: "Cannot connect to TARX services. Please check that the servers are running."
- **Actions**: Check Status, Retry

### 7. Model Unavailable
- **Code**: `MODEL_UNAVAILABLE`
- **Message**: "Selected model is offline. Please try a different model or check server status."
- **Actions**: Switch Model, Check Status

### 8. Unknown Error
- **Code**: `UNKNOWN`
- **Message**: Truncated error message (first 100 chars)
- **Actions**: Retry, Show Details

## Retry Logic

- **Default retries**: 1 (configurable)
- **Initial delay**: 2000ms
- **Backoff**: Exponential (1.5x multiplier)
- **Smart retry**: Only retries connection errors, not model errors

### Example Usage

```typescript
import { withRetry, showTarxError, withErrorHandling } from './errorHandler.js';

// Auto-retry on connection failures
const result = await withRetry(
  () => fetch('http://localhost:11435/health'),
  1, // retries
  2000 // initial delay
);

// Show user-friendly error
try {
  await someInferenceCall();
} catch (error) {
  await showTarxError(error);
}

// Complete error handling with progress
const result = await withErrorHandling(
  () => someAsyncOperation(),
  {
    showProgress: true,
    progressMessage: 'Processing...',
    retries: 1
  }
);
```

## VS Code Integration

### Commands

- `tarx.chat.retry` - Retry last request (placeholder for chat participant)
- `tarx.status.showDetails` - Show TARX service status
- `tarx.status.switchModel` - Switch to different model

### User Experience

1. Connection errors show warning messages (not errors)
2. Recovery actions provided as buttons
3. Context-specific advice based on error type
4. No technical jargon in user-facing messages

## Testing

Run error classification tests:

```bash
cd extensions/tarx-skills-provider
npx tsx src/test/errorHandler.test.ts
```

Expected output:
```
=== TARX Error Handler Tests ===

Testing error classification...
✓ Inference server offline: TARX local AI is starting up. This usually takes ~11 seconds.
✓ Embeddings server offline: Knowledge search unavailable (embedding server offline). Continuing without search.
✓ Mesh network offline: Mesh network unavailable. Running in local-only mode.
✓ Request timeout: Local inference taking longer than expected. Complex query?
✓ Server error: TARX server encountered an error. Please try again.
✓ Model unavailable: Selected model is offline. Please try a different model or check server status.
✓ Unknown error: Something went wrong: Something completely unexpected

Results: 7 passed, 0 failed
```

## Future Improvements

1. **Telemetry**: Track error frequencies for better diagnostics
2. **Auto-recovery**: Automatically restart services if possible
3. **Error context**: Include recent operations in error reports
4. **User preferences**: Allow users to configure retry behavior
5. **Error aggregation**: Don't spam users with repeated errors

## Files Modified

- `src/errorHandler.ts` - New error handling module
- `src/modelProvider.ts` - Integrated error handling
- `src/extension.ts` - Skill execution error handling
- `src/test/errorHandler.test.ts` - Test suite

## Compilation Status

✅ All TypeScript files compile without errors
✅ Error classification tests pass
✅ Ready for integration testing
