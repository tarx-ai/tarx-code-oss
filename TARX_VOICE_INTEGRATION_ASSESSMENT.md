# TARX Voice Integration Assessment - CODE OSS

**Date:** January 24, 2026
**Assessed by:** Claude Code
**Target Repository:** `/Users/master/Desktop/tarx-code-oss`
**Status:** Research Complete - Ready for Implementation

---

## 1. Executive Summary

TARX CODE is a VS Code fork with built-in AI assistant powered by local llama-server. The codebase has:

| Asset | Details |
|-------|---------|
| **Existing Voice Infrastructure** | VS Code's `ISpeechService` and `VoiceChatService` |
| **TARX Extension** | `extensions/tarx/` with chat participant and commands |
| **Custom TARX Chat UI** | `src/vs/workbench/contrib/chat/browser/tarx/` (4,149 LOC) |
| **Voice Actions** | `voiceChatActions.ts` (49KB, already implemented) |

**Recommendation:** Leverage the existing VS Code speech infrastructure and register a custom TARX speech provider.

---

## 2. Current State of CODE OSS

### 2.1 Framework Overview

| Component | Technology |
|-----------|------------|
| Base | VS Code fork (Microsoft Code-OSS) |
| Build System | Gulp + TypeScript |
| Runtime | Electron |
| UI Framework | Native VS Code DOM (no React/Vue) |
| AI Backend | llama-server on localhost:11435 |

### 2.2 Directory Structure

```
tarx-code-oss/
├── src/vs/workbench/contrib/
│   ├── chat/                    # Main chat system
│   │   ├── browser/
│   │   │   ├── tarx/           # Custom TARX UI (4,149 LOC)
│   │   │   │   ├── tarxApiService.ts       (507 lines)
│   │   │   │   ├── tarxChatViewPane.ts     (573 lines)
│   │   │   │   ├── tarxFileHandler.ts      (443 lines)
│   │   │   │   ├── tarxArtifactCard.ts     (428 lines)
│   │   │   │   ├── tarxEditorInsert.ts     (387 lines)
│   │   │   │   ├── tarxMessageRenderer.ts  (319 lines)
│   │   │   │   ├── tarxStreamingHandler.ts (272 lines)
│   │   │   │   └── ... (11 more files)
│   │   │   ├── actions/        # Chat actions
│   │   │   └── widget/         # Chat widget
│   │   ├── common/
│   │   │   └── voiceChatService.ts  # Voice chat service
│   │   └── electron-browser/
│   │       └── actions/
│   │           └── voiceChatActions.ts  # Voice actions (49KB)
│   └── speech/                  # Speech infrastructure
│       ├── browser/
│       │   └── speechService.ts # Implementation (16KB)
│       └── common/
│           └── speechService.ts # Interface
├── extensions/
│   └── tarx/                    # TARX extension
│       ├── src/
│       │   ├── extension.ts     # Main extension (341 lines)
│       │   ├── tarxClient.ts    # API client (214 lines)
│       │   ├── languageModelProvider.ts
│       │   ├── completionProvider.ts
│       │   └── statusBar.ts
│       └── package.json
└── ...
```

### 2.3 Existing Voice Infrastructure

VS Code has comprehensive voice support built-in:

| Service | Location | Purpose |
|---------|----------|---------|
| `ISpeechService` | `speech/common/speechService.ts` | Core speech-to-text/text-to-speech interface |
| `SpeechService` | `speech/browser/speechService.ts` | Browser implementation with extension point |
| `IVoiceChatService` | `chat/common/voiceChatService.ts` | Voice input for chat with @agent support |
| `VoiceChatActions` | `chat/electron-browser/actions/voiceChatActions.ts` | Voice commands and UI (49KB) |

**Speech Provider Pattern:**
```typescript
// From speechService.ts - extensions register providers via this interface
interface ISpeechProvider {
  readonly metadata: ISpeechProviderMetadata;
  createSpeechToTextSession(token: CancellationToken): ISpeechToTextSession;
  createTextToSpeechSession(token: CancellationToken): ITextToSpeechSession;
  createKeywordRecognitionSession(token: CancellationToken): IKeywordRecognitionSession;
}
```

**VoiceChatService Features:**
- Converts "at workspace slash fix" → "@workspace /fix"
- Agent name aliasing (vscode → code)
- Session management with context keys
- Integration with chat participant system

---

## 3. Integration Options (Ranked by Feasibility)

### Option 1: TARX Speech Provider Extension (Recommended)

**Approach:** Register TARX as a VS Code `SpeechProvider` via the extension

| Aspect | Details |
|--------|---------|
| **Pros** | Uses stable VS Code speech API, native voice button, minimal code |
| **Cons** | Limited to VS Code's voice UX, requires proposed API |
| **Effort** | Low (1-2 days) |
| **Feasibility** | High |

**Implementation:**
1. Create `TarxSpeechProvider` implementing `ISpeechProvider`
2. Connect to tarx-voice WebSocket at port 11438
3. Register via extension activation
4. Existing `VoiceChatActions` automatically works

### Option 2: Custom Voice Component in TARX Chat UI

**Approach:** Add voice button and waveform directly to `TarxInputArea`

| Aspect | Details |
|--------|---------|
| **Pros** | Full UI control, matches Figma designs exactly |
| **Cons** | More code, parallel to existing voice system |
| **Effort** | Medium (2-3 days) |
| **Feasibility** | Medium-High |

**Implementation:**
1. Create `tarxVoiceService.ts` with WebSocket connection
2. Add voice button to `tarxInputArea.ts`
3. Create `tarxVoiceWaveform.ts` for visualization
4. Integrate with existing TARX chat components

### Option 3: Hybrid Approach (Best of Both)

**Approach:** Use Option 1 for speech infrastructure + custom UI in TARX chat

| Aspect | Details |
|--------|---------|
| **Pros** | Native infrastructure + custom UI flexibility |
| **Cons** | Some duplication |
| **Effort** | Medium (3-4 days) |
| **Feasibility** | High |

---

## 4. TARX Voice Components → CODE OSS Mapping

| TARX Component | Source | CODE OSS Target | Strategy |
|----------------|--------|-----------------|----------|
| VoiceButton | @tarx/voice-ui | `tarx/tarxInputArea.ts` | Add to input toolbar |
| VoiceWaveform | @tarx/voice-ui | `tarx/tarxVoiceWaveform.ts` | New component |
| VoiceStatus | @tarx/voice-ui | Accessibility signals | Use existing `voiceRecordingStarted/Stopped` |
| useVoice hook | @tarx/voice-ui | `tarx/tarxVoiceService.ts` | Convert to class-based service |
| WebSocket client | @tarx/voice-ui | `tarx/tarxVoiceService.ts` | Port directly |

### Port Architecture

| Port | Service | Purpose |
|------|---------|---------|
| 11435 | llama-server | Text chat/completions |
| 11438 | tarx-voice | Voice WebSocket proxy |
| 8998 | moshi-backend | Kyutai Moshi model |

---

## 5. Detailed Implementation Plan (Option 2)

### 5.1 New Files Required

| File | Lines | Purpose |
|------|-------|---------|
| `tarx/tarxVoiceService.ts` | ~200 | WebSocket connection, audio streaming |
| `tarx/tarxVoiceButton.ts` | ~100 | Voice button component |
| `tarx/tarxVoiceWaveform.ts` | ~150 | Audio visualization |

### 5.2 Files to Modify

| File | Changes |
|------|---------|
| `tarx/tarxInputArea.ts` | Add voice button to toolbar |
| `tarx/tarxChatViewPane.ts` | Initialize voice service |
| `tarx/media/tarxChat.css` | Voice UI styles |
| `extensions/tarx/package.json` | Add voiceEndpoint config |

### 5.3 TarxVoiceService Implementation

```typescript
// src/vs/workbench/contrib/chat/browser/tarx/tarxVoiceService.ts

export interface ITarxVoiceService {
    readonly _serviceBrand: undefined;

    // Events
    readonly onDidStartRecording: Event<void>;
    readonly onDidStopRecording: Event<void>;
    readonly onDidTranscribe: Event<string>;
    readonly onDidError: Event<string>;

    // State
    isRecording(): boolean;

    // Methods
    startRecording(): Promise<void>;
    stopRecording(): Promise<void>;
}

export class TarxVoiceService extends Disposable implements ITarxVoiceService {
    private webSocket: WebSocket | null = null;
    private recording = false;
    private mediaRecorder: MediaRecorder | null = null;
    private voiceEndpoint: string;

    constructor(
        @IConfigurationService configurationService: IConfigurationService
    ) {
        super();
        this.voiceEndpoint = configurationService.getValue('tarx.voiceEndpoint')
            || 'ws://localhost:11438';
    }

    async startRecording(): Promise<void> {
        // 1. Request microphone access
        // 2. Connect WebSocket
        // 3. Start streaming audio
        // 4. Process transcription events
    }

    stopRecording(): void {
        // 1. Stop MediaRecorder
        // 2. Close WebSocket
        // 3. Fire completion event
    }
}
```

---

## 6. Testing Strategy

### 6.1 Unit Tests

| Test | Framework | Location |
|------|-----------|----------|
| TarxVoiceService | Mocha | `test/unit/` |
| WebSocket handling | Mocha | `test/unit/` |
| Error recovery | Mocha | `test/unit/` |

### 6.2 Manual Test Scenarios (10)

| # | Category | Scenario | Steps | Expected |
|---|----------|----------|-------|----------|
| 1 | UI | Voice button visible | Open TARX chat | Mic icon in input toolbar |
| 2 | Recording | Start recording | Click mic | Button animates, waveform shows |
| 3 | Recording | Stop recording | Click mic again | Recording stops, text inserted |
| 4 | Transcription | Speak text | Say "Hello world" | "Hello world" appears in input |
| 5 | Commands | Voice command | Say "at tarx explain" | "@tarx /explain" in input |
| 6 | Cancel | Cancel recording | Press Escape | Recording stops, no text |
| 7 | Error | No microphone | Deny permission | Error message shown |
| 8 | Error | Backend down | Stop tarx-voice | Graceful error state |
| 9 | Integration | Send voice message | Record → Send | Message sent via API |
| 10 | Reconnect | Connection drop | Disconnect/reconnect | Auto-reconnects |

---

## 7. Timeline & Effort

| Phase | Tasks | Effort |
|-------|-------|--------|
| **Phase 1: Setup** | Create TarxVoiceService skeleton | 2-3 hours |
| **Phase 2: WebSocket** | Implement connection + audio streaming | 4-5 hours |
| **Phase 3: UI** | Add voice button + waveform | 3-4 hours |
| **Phase 4: Integration** | Wire to TarxInputArea + TarxChatViewPane | 2-3 hours |
| **Phase 5: Testing** | Unit tests + manual testing | 3-4 hours |
| **Phase 6: Polish** | Error handling, accessibility, styles | 2-3 hours |

**Total Estimate:** 2-3 days

---

## 8. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| WebSocket instability | Medium | Medium | Implement reconnection with backoff |
| Microphone permission | Medium | Low | Clear permission prompt, error message |
| Browser compatibility | Low | Medium | Test Chrome, Firefox, Safari |
| Voice backend unavailable | High | Medium | Show placeholder state, retry option |
| Audio quality issues | Low | Low | Document requirements |

---

## 9. Configuration

Add to `extensions/tarx/package.json`:

```json
{
  "configuration": {
    "properties": {
      "tarx.voiceEndpoint": {
        "type": "string",
        "default": "ws://localhost:11438",
        "description": "TARX voice server WebSocket URL"
      },
      "tarx.voiceEnabled": {
        "type": "boolean",
        "default": true,
        "description": "Enable voice input features"
      }
    }
  }
}
```

---

## 10. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      TARX CODE OSS                          │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────┐  │
│  │               TarxChatViewPane                        │  │
│  │  ┌─────────────────────────────────────────────────┐ │  │
│  │  │              TarxChatPanel                       │ │  │
│  │  │  ┌────────────────────────────────────────────┐ │ │  │
│  │  │  │           TarxInputArea                     │ │ │  │
│  │  │  │  ┌──────────┐ ┌──────────┐ ┌────────────┐  │ │ │  │
│  │  │  │  │ Textarea │ │ VoiceBtn │ │ Send Btn   │  │ │ │  │
│  │  │  │  └──────────┘ └────┬─────┘ └────────────┘  │ │ │  │
│  │  │  │                    │                        │ │ │  │
│  │  │  │  ┌─────────────────┴────────────────────┐  │ │ │  │
│  │  │  │  │         TarxVoiceWaveform            │  │ │ │  │
│  │  │  │  └──────────────────────────────────────┘  │ │ │  │
│  │  │  └────────────────────────────────────────────┘ │ │  │
│  │  └─────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                     Services Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │TarxApiService│  │TarxVoiceServ │  │TarxStreamHandler │  │
│  │   :11435     │  │   :11438     │  │                  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────┘  │
│         │                 │                                 │
└─────────┼─────────────────┼─────────────────────────────────┘
          │    WebSocket    │
          │                 │
┌─────────┴─────────────────┴─────────────────────────────────┐
│                    TARX Backend                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ llama-server │  │ tarx-voice   │  │  moshi-backend   │  │
│  │   :11435     │  │   :11438     │  │     :8998        │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 11. Success Criteria

- [ ] Voice button visible in TARX chat input toolbar
- [ ] Clicking voice button starts recording with visual feedback
- [ ] Waveform visualization shows audio levels
- [ ] Real-time transcription appears as user speaks
- [ ] Voice commands work ("at tarx" → "@tarx")
- [ ] Can cancel recording with Escape key
- [ ] Graceful error handling when backend unavailable
- [ ] Build compiles with 0 errors
- [ ] All 10 test scenarios passing
- [ ] No breaking changes to existing chat functionality

---

## 12. Next Steps

1. **Confirm voice backend API** - WebSocket protocol spec
2. **Create TarxVoiceService** - Core voice logic
3. **Add UI components** - Voice button + waveform
4. **Wire integration** - Connect to TarxInputArea
5. **Testing** - Unit + manual scenarios
6. **Documentation** - Update README

---

## Appendix: Key File References

| File | Purpose | Lines |
|------|---------|-------|
| `speechService.ts` (common) | ISpeechService interface | 245 |
| `speechService.ts` (browser) | SpeechService implementation | 500+ |
| `voiceChatService.ts` | IVoiceChatService for chat | 252 |
| `voiceChatActions.ts` | Voice UI actions | 1400+ |
| `tarxInputArea.ts` | Input area (add voice here) | 185 |
| `tarxChatViewPane.ts` | View pane (init voice service) | 573 |

---

**Assessment Complete. Ready for Implementation.**
