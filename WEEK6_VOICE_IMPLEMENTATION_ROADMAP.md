# Week 6: TARX Voice Implementation Roadmap

**Start Date:** Week of January 27, 2026
**Duration:** 4-5 days
**Goal:** Voice input working in CODE OSS via TARX Speech Provider

---

## Overview

```
Week 6 Voice Integration
├─ Day 1: Setup & Foundation
├─ Day 2: Core Implementation
├─ Day 3: Integration & Wiring
├─ Day 4: Testing
└─ Day 5: Polish & Documentation
```

---

## Day 1: Setup & Foundation

### Morning: Project Setup
- [ ] Create `extensions/tarx/src/speechProvider.ts`
- [ ] Add type definitions for WebSocket messages
- [ ] Update `package.json` with `speech` proposal

### Afternoon: WebSocket Foundation
- [ ] Implement WebSocket connection to tarx-voice:11438
- [ ] Add reconnection logic
- [ ] Test basic connectivity

**Deliverables:**
- `speechProvider.ts` with connection skeleton
- WebSocket connects to tarx-voice successfully

---

## Day 2: Core Implementation

### Morning: Speech-to-Text Session
- [ ] Implement `createSpeechToTextSession()`
- [ ] Set up MediaRecorder for audio capture
- [ ] Stream audio to WebSocket

### Afternoon: Transcript Handling
- [ ] Parse transcript events from Moshi
- [ ] Emit `SpeechToTextStatus` events
- [ ] Handle partial vs final transcripts

**Deliverables:**
- Working STT session
- Transcripts flowing from Moshi to VS Code events

---

## Day 3: Integration & Wiring

### Morning: Register Provider
- [ ] Register TarxSpeechProvider in `extension.ts`
- [ ] Test native VS Code voice button
- [ ] Verify "@tarx" command recognition

### Afternoon: Status Bar & Settings
- [ ] Add voice status to status bar
- [ ] Add `tarx.voiceUrl` setting
- [ ] Handle configuration changes

**Deliverables:**
- Voice works via native VS Code UI
- Settings configurable

---

## Day 4: Testing

### Morning: Unit Tests
- [ ] Test WebSocket connection/disconnection
- [ ] Test transcript event emission
- [ ] Test cancellation handling
- [ ] Test error states

### Afternoon: Manual Testing
- [ ] Execute 5 test scenarios
- [ ] Fix discovered issues
- [ ] Test with different audio inputs

**Test Scenarios:**
1. Voice button visible in chat
2. Start voice, see "Listening..."
3. Speak "@tarx explain" command
4. Cancel with Escape
5. Error handling when service down

**Deliverables:**
- All unit tests passing
- 5/5 manual scenarios passing

---

## Day 5: Polish & Documentation

### Morning: Edge Cases
- [ ] Improve error messages
- [ ] Add loading states
- [ ] Handle network timeouts

### Afternoon: Documentation
- [ ] Update extension README
- [ ] Add voice setup instructions
- [ ] Code review & cleanup

**Deliverables:**
- Production-ready implementation
- Documentation complete

---

## Implementation Details

### File: `extensions/tarx/src/speechProvider.ts`

```typescript
import * as vscode from 'vscode';

interface MoshiMessage {
  type: 'transcript' | 'audio' | 'error';
  text?: string;
  isPartial?: boolean;
}

export class TarxSpeechProvider implements vscode.SpeechProvider {
  readonly metadata = {
    extension: new vscode.ExtensionIdentifier('tarx'),
    displayName: 'TARX Voice (Moshi)'
  };

  private wsUrl: string;

  constructor(wsUrl: string = 'ws://127.0.0.1:11438') {
    this.wsUrl = wsUrl;
  }

  createSpeechToTextSession(
    token: vscode.CancellationToken
  ): vscode.SpeechToTextSession {
    return new TarxSpeechToTextSession(this.wsUrl, token);
  }

  createTextToSpeechSession(
    token: vscode.CancellationToken
  ): vscode.TextToSpeechSession {
    return new TarxTextToSpeechSession(this.wsUrl, token);
  }

  createKeywordRecognitionSession(
    token: vscode.CancellationToken
  ): vscode.KeywordRecognitionSession {
    // Optional: Implement "Hey TARX" wake word
    throw new Error('Keyword recognition not implemented');
  }
}

class TarxSpeechToTextSession implements vscode.SpeechToTextSession {
  private readonly _onDidChange = new vscode.EventEmitter<vscode.SpeechToTextEvent>();
  readonly onDidChange = this._onDidChange.event;

  private ws: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;

  constructor(
    private readonly wsUrl: string,
    private readonly token: vscode.CancellationToken
  ) {
    this.start();
    token.onCancellationRequested(() => this.stop());
  }

  private async start(): Promise<void> {
    try {
      // Connect WebSocket
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        this._onDidChange.fire({ status: vscode.SpeechToTextStatus.Started });
        this.startAudioCapture();
      };

      this.ws.onmessage = (event) => {
        const msg: MoshiMessage = JSON.parse(event.data);
        if (msg.type === 'transcript' && msg.text) {
          this._onDidChange.fire({
            status: msg.isPartial
              ? vscode.SpeechToTextStatus.Recognizing
              : vscode.SpeechToTextStatus.Recognized,
            text: msg.text
          });
        }
      };

      this.ws.onerror = () => {
        this._onDidChange.fire({ status: vscode.SpeechToTextStatus.Error });
      };

      this.ws.onclose = () => {
        this._onDidChange.fire({ status: vscode.SpeechToTextStatus.Stopped });
      };

    } catch (error) {
      this._onDidChange.fire({ status: vscode.SpeechToTextStatus.Error });
    }
  }

  private async startAudioCapture(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mediaRecorder = new MediaRecorder(stream);

    this.mediaRecorder.ondataavailable = (event) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(event.data);
      }
    };

    this.mediaRecorder.start(100); // Send chunks every 100ms
  }

  private stop(): void {
    this.mediaRecorder?.stop();
    this.ws?.close();
    this._onDidChange.fire({ status: vscode.SpeechToTextStatus.Stopped });
  }
}
```

### File: `extensions/tarx/src/extension.ts` (additions)

```typescript
import { TarxSpeechProvider } from './speechProvider';

export function activate(context: vscode.ExtensionContext) {
  // ... existing code ...

  // Register Speech Provider
  const voiceUrl = config.get<string>('voiceUrl', 'ws://127.0.0.1:11438');
  const speechProvider = new TarxSpeechProvider(voiceUrl);

  try {
    context.subscriptions.push(
      vscode.speech.registerSpeechProvider('tarx', speechProvider)
    );
    console.log('[TARX] Speech provider registered');
  } catch (error) {
    console.log('[TARX] Speech provider registration failed:', error);
  }
}
```

### File: `extensions/tarx/package.json` (additions)

```json
{
  "enabledApiProposals": [
    "speech",
    "defaultChatParticipant",
    "chatParticipantAdditions",
    "chatProvider"
  ],
  "contributes": {
    "configuration": {
      "properties": {
        "tarx.voiceUrl": {
          "type": "string",
          "default": "ws://127.0.0.1:11438",
          "description": "TARX voice service WebSocket URL"
        }
      }
    }
  }
}
```

---

## Dependencies

### Services Required
```bash
# Must be running before testing:
tarx-voice    # Port 11438 (WebSocket proxy)
moshi-backend # Port 8998 (Moshi model)
```

### Verify Services
```bash
# Check if services are running
lsof -i :11438  # Should show tarx-voice
lsof -i :8998   # Should show moshi-backend
```

---

## Success Criteria

### Day 1
- [ ] speechProvider.ts created
- [ ] WebSocket connects to tarx-voice

### Day 2
- [ ] Audio streams to Moshi
- [ ] Transcripts received from Moshi

### Day 3
- [ ] Voice button works in VS Code
- [ ] "@tarx" recognized from speech

### Day 4
- [ ] 5/5 test scenarios pass
- [ ] Unit tests written

### Day 5
- [ ] Documentation complete
- [ ] Ready for pre-release

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Speech API not available | Check `vscode.speech` exists before registering |
| WebSocket timeout | 5s connection timeout, retry with backoff |
| Audio permission denied | Show clear error, link to permission settings |
| Moshi latency | Use streaming, show "Listening..." indicator |

---

## Commands

### Development
```bash
cd /Users/master/Desktop/tarx-code-oss
npm run watch-extensions  # Watch extension changes

# In another terminal:
./scripts/code.sh --extensionDevelopmentPath=./extensions/tarx
```

### Testing
```bash
cd /Users/master/Desktop/tarx-code-oss/extensions/tarx
npm test
```

### Build
```bash
cd /Users/master/Desktop/tarx-code-oss
npm run compile
```

---

## Contact Points

- **TARX Extension:** `extensions/tarx/`
- **VS Code Speech:** `src/vs/workbench/contrib/speech/`
- **Voice Service:** tarx-voice:11438
- **Moshi Model:** moshi-backend:8998

---

*Roadmap ready. Begin implementation Day 1.*
