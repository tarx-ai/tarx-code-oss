# Known Issues - TARX CODE v1.0.0-beta.1

## Build Issues

### telemetryService.test.ts Type Error
- **Status**: Pre-existing (VS Code upstream)
- **Impact**: Test file only, does not affect application
- **Error**: Sinon type mismatch in test file
- **Workaround**: None needed - main application compiles correctly

## GPU/Rendering

### Black Screen on Apple Silicon
- **Status**: Mitigated
- **Cause**: GPU acceleration conflicts with Electron on M-series chips
- **Mitigation**:
  - Application launches with `--disable-gpu --use-gl=angle`
  - CSS transitions disabled in TARX sidebar
  - DOM operations deferred with setTimeout

## Extensions

### Speech Provider Registration Error
- **Status**: Known
- **Message**: "Speech provider with identifier tarx is already registered"
- **Impact**: Cosmetic only - voice functionality works
- **Cause**: Extension may activate twice in development

### File Watcher Crashes
- **Status**: Known
- **Message**: "UtilityProcessWorker terminated unexpectedly"
- **Impact**: File watching may need restart
- **Workaround**: Reload window if file changes not detected

## Local LLM

### Model Path Detection
- **Status**: Known
- **Cause**: Requires Ollama models in default location
- **Workaround**: Ensure models are in ~/.ollama/models/

## SuperComputer Mesh

### Peer Discovery Latency
- **Status**: Expected behavior
- **Cause**: mDNS/libp2p discovery takes time
- **Note**: First peer connection may take 30-60 seconds

## Sidebar

### History Shows Mock Data
- **Status**: Expected initially
- **Cause**: Real history fetched async, mock data shown first
- **Note**: Will update after 30 seconds when real data available

## Reporting Issues

Please report issues at: https://github.com/tarx-ai/tarx-code-oss/issues

Include:
- TARX version
- Operating system
- Steps to reproduce
- Console logs (Developer Tools > Console)
