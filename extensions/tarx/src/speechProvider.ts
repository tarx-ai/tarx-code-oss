/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  TARX Speech Provider
 *  Implements VS Code's ISpeechProvider to integrate with tarx-voice:11439 (Moshi)
 *  Enables native voice features throughout the IDE
 *
 *  ARCHITECTURE:
 *  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
 *  │  VS Code Chat   │───▶│  tarx-voice     │───▶│  Moshi Backend  │
 *  │  (Audio Input)  │◀───│  :11439         │◀───│  :8998 (STT)    │
 *  └─────────────────┘    └─────────────────┘    └─────────────────┘
 *
 *  Data Flow:
 *  1. User clicks voice button → VS Code calls provideSpeechToTextSession()
 *  2. Session connects to tarx-voice WebSocket
 *  3. tarx-voice captures audio (browser-based) or receives from client
 *  4. Audio sent to Moshi for transcription
 *  5. Transcript returned via WebSocket → emitted via onDidChange
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
// @ts-ignore - ws module doesn't have types in this environment
import WebSocket from 'ws';
// @ts-ignore - mic module for audio capture
import mic from 'mic';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import type { VoiceTranscriptPanel } from './voiceTranscriptPanel';

// Module-level reference to the transcript panel
let transcriptPanel: VoiceTranscriptPanel | null = null;

/**
 * Set the transcript panel instance (called from extension.ts)
 */
export function setTranscriptPanel(panel: VoiceTranscriptPanel | null): void {
	transcriptPanel = panel;
	console.log('[TARX Speech] Transcript panel', panel ? 'connected' : 'disconnected');
}

/**
 * Get the current transcript panel instance
 */
export function getTranscriptPanel(): VoiceTranscriptPanel | null {
	return transcriptPanel;
}

/**
 * Speech-to-text session status codes (VS Code speech API)
 */
const SpeechStatus = {
	Started: 1,
	Recognizing: 2,  // Partial transcript
	Recognized: 3,   // Final transcript
	Stopped: 4,
	Error: 5
} as const;

/**
 * Message format from tarx-voice/Moshi
 */
interface MoshiMessage {
	type: 'transcript' | 'audio' | 'error' | 'status' | 'ready';
	text?: string;
	isPartial?: boolean;
	isFinal?: boolean;
	error?: string;
	status?: string;
	speaker?: 'user' | 'moshi';
}

/**
 * Audio Player for Moshi TTS responses
 * Buffers incoming Opus/OGG audio chunks and plays them using system player
 */
class MoshiAudioPlayer {
	private audioBuffer: Buffer[] = [];
	private isPlaying: boolean = false;
	private tempDir: string;
	// Playback disabled - tarx-voice handles audio playback via afplay
	// VS Code just receives audio for potential visualization/buffering
	private playbackEnabled: boolean = false;

	constructor() {
		// Create temp directory for audio files
		this.tempDir = path.join(os.tmpdir(), 'tarx-voice');
		if (!fs.existsSync(this.tempDir)) {
			fs.mkdirSync(this.tempDir, { recursive: true });
		}
		console.log('[TARX Audio] Player initialized (playback via tarx-voice)');
	}

	/**
	 * Add audio chunk to buffer
	 * Audio from Moshi is Opus-encoded
	 */
	addChunk(data: Buffer): void {
		this.audioBuffer.push(data);
		if (this.audioBuffer.length <= 5 || this.audioBuffer.length % 20 === 0) {
			console.log(`[TARX Audio] Buffered chunk #${this.audioBuffer.length}: ${data.length} bytes`);
		}
	}

	/**
	 * Play accumulated audio buffer
	 * Writes to temp file and uses platform audio player
	 */
	async playBuffer(): Promise<void> {
		if (!this.playbackEnabled || this.audioBuffer.length === 0) {
			return;
		}

		if (this.isPlaying) {
			console.log('[TARX Audio] Already playing, skipping');
			return;
		}

		this.isPlaying = true;
		const totalChunks = this.audioBuffer.length;
		const totalBytes = this.audioBuffer.reduce((sum, buf) => sum + buf.length, 0);
		console.log(`[TARX Audio] Playing ${totalChunks} chunks (${totalBytes} bytes)`);

		try {
			// Combine all chunks
			const combinedAudio = Buffer.concat(this.audioBuffer);
			this.audioBuffer = [];

			// Write to temp file (.ogg extension for better player compatibility)
			const tempFile = path.join(this.tempDir, `moshi-tts-${Date.now()}.ogg`);
			fs.writeFileSync(tempFile, combinedAudio);
			console.log(`[TARX Audio] Wrote ${combinedAudio.length} bytes to ${tempFile}`);

			// Play using platform player
			await this.playFile(tempFile);

			// Cleanup temp file after playback
			try {
				fs.unlinkSync(tempFile);
			} catch {
				// Ignore cleanup errors
			}
		} catch (error) {
			console.error('[TARX Audio] Playback error:', error);
		} finally {
			this.isPlaying = false;
		}
	}

	/**
	 * Play audio file using ffplay (most reliable for Opus/OGG)
	 * macOS afplay doesn't support Opus natively
	 */
	private playFile(filePath: string): Promise<void> {
		return new Promise((resolve, reject) => {
			console.log(`[TARX Audio] Playing file: ${filePath}`);

			// Use ffplay as primary player (supports Opus/OGG)
			const player = spawn('ffplay', ['-nodisp', '-autoexit', '-loglevel', 'warning', filePath]);

			player.stderr.on('data', (data: Buffer) => {
				console.log(`[TARX Audio] ffplay: ${data.toString().trim()}`);
			});

			player.on('error', (err) => {
				console.error(`[TARX Audio] ffplay error:`, err);
				// Fallback to afplay (might work for some formats)
				this.playWithAfplay(filePath).then(resolve).catch(reject);
			});

			player.on('close', (code) => {
				if (code === 0) {
					console.log('[TARX Audio] Playback completed');
					resolve();
				} else {
					console.warn(`[TARX Audio] ffplay exited with code ${code}`);
					resolve(); // Don't fail, just log
				}
			});
		});
	}

	/**
	 * Fallback: play with afplay (macOS native, limited format support)
	 */
	private playWithAfplay(filePath: string): Promise<void> {
		return new Promise((resolve) => {
			const player = spawn('afplay', [filePath]);
			player.on('error', () => resolve());
			player.on('close', () => resolve());
		});
	}


	/**
	 * Clear buffer without playing
	 */
	clear(): void {
		const count = this.audioBuffer.length;
		this.audioBuffer = [];
		if (count > 0) {
			console.log(`[TARX Audio] Cleared ${count} buffered chunks`);
		}
	}

	/**
	 * Enable/disable playback
	 */
	setEnabled(enabled: boolean): void {
		this.playbackEnabled = enabled;
		console.log(`[TARX Audio] Playback ${enabled ? 'enabled' : 'disabled'}`);
	}
}

/**
 * TARX Speech Provider
 * Connects to tarx-voice WebSocket and provides speech-to-text via Moshi
 */
export class TarxSpeechProvider {
	private wsUrl: string;

	constructor(wsUrl: string = 'ws://127.0.0.1:11439') {
		this.wsUrl = wsUrl;
		console.log(`[TARX Speech] Provider initialized with ${wsUrl}`);
	}

	/**
	 * Create a speech-to-text session (implements VS Code ISpeechProvider)
	 */
	createSpeechToTextSession(
		token: vscode.CancellationToken,
		options?: { syntheticMode?: boolean }
	): TarxSpeechToTextSession {
		return new TarxSpeechToTextSession(this.wsUrl, token, options);
	}

	/**
	 * Create a text-to-speech session (placeholder)
	 */
	createTextToSpeechSession(
		token: vscode.CancellationToken
	): TarxTextToSpeechSession {
		return new TarxTextToSpeechSession(this.wsUrl, token);
	}

	/**
	 * Create a keyword recognition session (placeholder)
	 */
	createKeywordRecognitionSession(
		token: vscode.CancellationToken
	): TarxKeywordRecognitionSession {
		return new TarxKeywordRecognitionSession(token);
	}
}

/**
 * Speech-to-Text Session
 * Handles WebSocket connection to tarx-voice for Moshi STT
 *
 * Audio capture flow:
 * 1. Microphone → mic package (Node.js) → raw PCM (16kHz mono)
 * 2. PCM chunks → WebSocket → tarx-voice
 * 3. tarx-voice encodes to Opus/OGG → Moshi
 * 4. Moshi transcripts → tarx-voice → WebSocket → this session
 */
class TarxSpeechToTextSession {
	private readonly _onDidChange = new vscode.EventEmitter<{
		status: number;
		text?: string;
	}>();
	readonly onDidChange = this._onDidChange.event;

	private ws: WebSocket | null = null;
	private isConnected: boolean = false;
	private reconnectAttempts: number = 0;

	// Audio capture
	private micInstance: ReturnType<typeof mic> | null = null;
	private micInputStream: NodeJS.ReadableStream | null = null;
	private isCapturing: boolean = false;

	// Audio playback for Moshi TTS responses
	private audioPlayer: MoshiAudioPlayer;
	private audioPlaybackTimer: NodeJS.Timeout | null = null;

	// Synthetic audio mode (for testing)
	private syntheticMode: boolean = false;

	constructor(
		private readonly wsUrl: string,
		private readonly token: vscode.CancellationToken,
		options?: { syntheticMode?: boolean }
	) {
		console.log('[TARX Speech] Creating STT session');
		this.audioPlayer = new MoshiAudioPlayer();
		this.syntheticMode = options?.syntheticMode ?? false;

		if (this.syntheticMode) {
			// In synthetic mode, don't auto-start mic capture
			this.startSyntheticSession();
		} else {
			this.start();
		}

		token.onCancellationRequested(() => {
			console.log('[TARX Speech] Session cancelled');
			this.stop();
		});
	}

	/**
	 * Start session for synthetic audio injection (no mic)
	 */
	private async startSyntheticSession(): Promise<void> {
		try {
			this._onDidChange.fire({ status: SpeechStatus.Started });
			transcriptPanel?.setListening(true);

			await this.connectWebSocket();

			if (this.ws && this.isConnected) {
				this.ws.send(JSON.stringify({
					type: 'start',
					config: {
						language: 'en',
						continuous: true,
						sampleRate: 48000,
						bitDepth: 32,
						channels: 1,
						encoding: 'pcm_s32le',
						synthetic: true // Flag for tarx-voice
					}
				}));
				console.log('[TARX Speech] Synthetic session started (no mic)');
			}
		} catch (error) {
			console.error('[TARX Speech] Error starting synthetic session:', error);
			this._onDidChange.fire({ status: SpeechStatus.Error });
		}
	}

	/**
	 * Inject synthetic audio data (for testing)
	 * @returns true if audio was sent successfully
	 */
	public injectAudio(audioData: Buffer): boolean {
		if (!this.ws || this.ws.readyState !== 1 /* WebSocket.OPEN */) {
			console.error('[TARX Speech] Cannot inject audio: WebSocket not connected');
			return false;
		}

		try {
			this.ws.send(audioData);
			return true;
		} catch (error) {
			console.error('[TARX Speech] Failed to inject audio:', error);
			return false;
		}
	}

	/**
	 * Check if WebSocket is connected
	 */
	public get isWebSocketConnected(): boolean {
		return this.ws !== null && this.ws.readyState === 1;
	}

	private async start(): Promise<void> {
		try {
			// Emit started status
			this._onDidChange.fire({ status: SpeechStatus.Started });

			// Notify transcript panel that we're listening
			transcriptPanel?.setListening(true);

			// Connect WebSocket to tarx-voice
			await this.connectWebSocket();

			// Send start command with audio config
			// NOTE: macOS forces 48kHz/32-bit even when we request 24kHz/16-bit
			// tarx-voice handles the conversion to 24kHz/16-bit for Moshi
			if (this.ws && this.isConnected) {
				this.ws.send(JSON.stringify({
					type: 'start',
					config: {
						language: 'en',
						continuous: true,
						// macOS Core Audio forces 48kHz even when 24kHz requested
						sampleRate: 48000,  // Actual macOS output (sox warning shows this)
						bitDepth: 32,       // Actual macOS output (32-bit signed integer)
						channels: 1,
						encoding: 'pcm_s32le'  // Signed 32-bit little-endian PCM (actual)
					}
				}));

				// Start microphone capture
				await this.startMicCapture();
			}
		} catch (error) {
			console.error('[TARX Speech] Error starting session:', error);
			this._onDidChange.fire({ status: SpeechStatus.Error });
		}
	}

	/**
	 * Start microphone capture and stream audio to tarx-voice
	 * Uses 24kHz mono PCM (Moshi's expected format)
	 */
	private async startMicCapture(): Promise<void> {
		try {
			console.log('[TARX Speech] Starting microphone capture...');

			// Configure mic for audio capture via sox/rec
			// NOTE: macOS Core Audio ignores these settings and forces 48kHz/32-bit
			// The tarx-voice server handles conversion to Moshi's 24kHz format
			// Requires sox: brew install sox
			this.micInstance = mic({
				rate: '24000',        // Requested 24kHz (macOS ignores, uses 48kHz)
				channels: '1',        // Mono
				bitwidth: '16',       // Requested 16-bit (macOS ignores, uses 32-bit)
				encoding: 'signed-integer',
				endian: 'little',
				device: 'default',    // Use default input device
				debug: true,          // Enable debug logging
				exitOnSilence: 0,     // Don't exit on silence (continuous)
				silence: '10.0'       // High silence threshold to prevent early exit
			});

			const audioStream = this.micInstance.getAudioStream();
			this.micInputStream = audioStream;

			// Track chunks for debugging
			let chunkCount = 0;
			let totalBytes = 0;

			// Handle audio data chunks
			audioStream.on('data', (chunk: Buffer) => {
				chunkCount++;
				totalBytes += chunk.length;
				if (chunkCount <= 5 || chunkCount % 50 === 0) {
					console.log(`[TARX Speech] Audio chunk #${chunkCount}: ${chunk.length} bytes (total: ${totalBytes})`);
				}
				if (this.ws && this.ws.readyState === WebSocket.OPEN && this.isCapturing) {
					// Send raw PCM as binary WebSocket message
					this.ws.send(chunk);
					if (chunkCount <= 5 || chunkCount % 100 === 0) {
						console.log(`[TARX Speech] ✓ Sent chunk #${chunkCount} to WS (${chunk.length} bytes)`);
					}
				} else {
					if (chunkCount <= 5) {
						console.error(`[TARX Speech] ✗ WS not ready for chunk #${chunkCount} (readyState: ${this.ws?.readyState}, isCapturing: ${this.isCapturing})`);
					}
				}
			});

			// Handle all mic events for debugging
			audioStream.on('startComplete', () => {
				console.log('[TARX Speech] Mic recording started successfully');
			});

			audioStream.on('stopComplete', () => {
				console.log('[TARX Speech] Mic recording stopped');
			});

			audioStream.on('silence', () => {
				console.log('[TARX Speech] Silence detected (still recording)');
			});

			audioStream.on('processExitComplete', () => {
				console.log('[TARX Speech] Mic process exited');
			});

			// Handle errors
			audioStream.on('error', (err: Error) => {
				console.error('[TARX Speech] Microphone error:', err.message, err);
				this._onDidChange.fire({ status: SpeechStatus.Error });
				this.stop();
			});

			// Handle stream end
			audioStream.on('end', () => {
				console.log(`[TARX Speech] Microphone stream ended (sent ${chunkCount} chunks, ${totalBytes} bytes)`);
			});

			// Start capturing
			console.log('[TARX Speech] Calling mic.start()...');
			this.micInstance.start();
			this.isCapturing = true;
			console.log('[TARX Speech] Microphone capture started (24kHz mono PCM via sox)');

		} catch (error) {
			console.error('[TARX Speech] Failed to start microphone:', error);
			this._onDidChange.fire({ status: SpeechStatus.Error });
			throw error;
		}
	}

	/**
	 * Stop microphone capture
	 */
	private stopMicCapture(): void {
		this.isCapturing = false;

		if (this.micInputStream) {
			this.micInputStream.removeAllListeners();
			this.micInputStream = null;
		}

		if (this.micInstance) {
			try {
				this.micInstance.stop();
			} catch {
				// Ignore stop errors
			}
			this.micInstance = null;
		}

		console.log('[TARX Speech] Microphone capture stopped');
	}

	private connectWebSocket(): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				console.log(`[TARX Speech] Connecting to ${this.wsUrl}`);
				this.ws = new WebSocket(this.wsUrl);

				const timeout = setTimeout(() => {
					console.error('[TARX Speech] WebSocket connection timeout');
					if (this.ws) {
						this.ws.close();
					}
					reject(new Error('WebSocket connection timeout'));
				}, 5000);

				this.ws.on('open', () => {
					clearTimeout(timeout);
					this.isConnected = true;
					this.reconnectAttempts = 0;
					console.log('[TARX Speech] WebSocket connected');
					resolve();
				});

				this.ws.on('message', (data: WebSocket.Data) => {
					// Convert to buffer for consistent handling
					const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data.toString());

					// Check if this is JSON (text message) or binary audio
					// JSON messages start with '{' (0x7b), binary audio doesn't
					const firstByte = buffer[0];
					const isJson = firstByte === 0x7b; // '{'

					if (!isJson && buffer.length > 0) {
						// Binary audio from Moshi TTS - buffer for playback
						console.log(`[TARX Speech] 🔊 Received TTS audio: ${buffer.length} bytes (first byte: 0x${firstByte.toString(16)})`);
						this.audioPlayer.addChunk(buffer);

						// Show thinking indicator while receiving audio (Moshi is responding)
						transcriptPanel?.showThinking();

						// Debounce playback - wait for more chunks or timeout
						if (this.audioPlaybackTimer) {
							clearTimeout(this.audioPlaybackTimer);
						}
						this.audioPlaybackTimer = setTimeout(() => {
							console.log('[TARX Speech] 🔊 Playing accumulated audio...');
							transcriptPanel?.hideThinking();
							this.audioPlayer.playBuffer();
						}, 500); // Wait 500ms after last chunk before playing

						return;
					}

					// JSON message - parse and handle
					try {
						const msg: MoshiMessage = JSON.parse(buffer.toString());
						this.handleMoshiMessage(msg);
					} catch (error) {
						console.error('[TARX Speech] Error parsing message:', error, 'Data:', buffer.toString().substring(0, 100));
					}
				});

				this.ws.on('error', (error: Error) => {
					clearTimeout(timeout);
					console.error('[TARX Speech] WebSocket error:', error.message);
					this._onDidChange.fire({ status: SpeechStatus.Error });
					reject(new Error(`WebSocket error: ${error.message}`));
				});

				this.ws.on('close', (code: number, reason: Buffer) => {
					this.isConnected = false;
					console.log(`[TARX Speech] WebSocket closed: ${code} ${reason.toString()}`);

					// Only emit stopped if we were connected (not during initial connection)
					if (this.reconnectAttempts === 0) {
						this._onDidChange.fire({ status: SpeechStatus.Stopped });
					}
				});
			} catch (error) {
				reject(error);
			}
		});
	}

	private handleMoshiMessage(msg: MoshiMessage): void {
		console.log('[TARX Speech] Received:', msg.type, msg.text || '');

		switch (msg.type) {
			case 'ready':
				console.log('[TARX Speech] Service ready');
				break;

			case 'transcript':
				if (msg.text) {
					// Status 2 = Recognizing (partial), Status 3 = Recognized (final)
					const isFinal = msg.isFinal ?? !msg.isPartial;
					const status = isFinal ? SpeechStatus.Recognized : SpeechStatus.Recognizing;
					const speaker = msg.speaker || 'user';
					console.log(`[TARX Speech] ${speaker} ${isFinal ? 'Final' : 'Partial'}: "${msg.text}"`);
					this._onDidChange.fire({ status, text: msg.text });

					// Push to transcript panel if available
					if (transcriptPanel) {
						// Hide thinking indicator when we get Moshi's response
						if (speaker === 'moshi') {
							transcriptPanel.hideThinking();
						}
						if (isFinal) {
							transcriptPanel.finalizeTranscript(msg.text, speaker);
						} else {
							transcriptPanel.addPartialTranscript(msg.text, speaker);
						}
					}
				}
				break;

			case 'status':
				console.log('[TARX Speech] Status:', msg.status);
				break;

			case 'error':
				console.error('[TARX Speech] Moshi error:', msg.error);
				this._onDidChange.fire({ status: SpeechStatus.Error });
				break;
		}
	}

	private stop(): void {
		console.log('[TARX Speech] Stopping session');

		// Notify transcript panel that we're no longer listening
		transcriptPanel?.setListening(false);

		// Stop microphone capture first
		this.stopMicCapture();

		// Clear audio playback timer
		if (this.audioPlaybackTimer) {
			clearTimeout(this.audioPlaybackTimer);
			this.audioPlaybackTimer = null;
		}

		// Play any remaining buffered audio before stopping
		this.audioPlayer.playBuffer();

		// Send stop command
		if (this.ws && this.isConnected) {
			try {
				this.ws.send(JSON.stringify({ type: 'stop' }));
			} catch {
				// Ignore send errors during shutdown
			}
		}

		// Close WebSocket
		if (this.ws) {
			try {
				this.ws.close(1000, 'Session ended');
			} catch {
				// Ignore close errors
			}
			this.ws = null;
		}

		this.isConnected = false;
		this._onDidChange.fire({ status: SpeechStatus.Stopped });
		console.log('[TARX Speech] Session stopped');
	}
}

/**
 * Text-to-Speech Session (placeholder for Moshi TTS)
 */
class TarxTextToSpeechSession {
	private readonly _onDidChange = new vscode.EventEmitter<{
		status: number;
		text?: string;
	}>();
	readonly onDidChange = this._onDidChange.event;

	constructor(
		private readonly _wsUrl: string,
		private readonly _token: vscode.CancellationToken
	) {
		console.log('[TARX Speech] TTS session created (not yet implemented)');
	}

	async synthesize(text: string): Promise<void> {
		console.log('[TARX Speech] TTS synthesize:', text);
		// TODO: Implement when Moshi TTS is ready
		this._onDidChange.fire({ status: SpeechStatus.Stopped });
	}
}

/**
 * Keyword Recognition Session (placeholder)
 */
class TarxKeywordRecognitionSession {
	private readonly _onDidChange = new vscode.EventEmitter<{
		status: number;
		text?: string;
	}>();
	readonly onDidChange = this._onDidChange.event;

	constructor(_token: vscode.CancellationToken) {
		console.log('[TARX Speech] Keyword recognition not implemented');
	}
}

// ============================================================================
// SYNTHETIC AUDIO INJECTION (for end-to-end testing)
// ============================================================================

/**
 * Active test session for synthetic audio injection
 */
let syntheticTestSession: TarxSpeechToTextSession | null = null;
let syntheticTestCts: vscode.CancellationTokenSource | null = null;

/**
 * Start a synthetic audio test session
 * This creates a real voice session but allows injecting audio programmatically
 */
export async function startSyntheticVoiceSession(wsUrl: string = 'ws://127.0.0.1:11439'): Promise<{
	success: boolean;
	sessionId: string;
	error?: string;
}> {
	try {
		// Clean up any existing session
		if (syntheticTestCts) {
			syntheticTestCts.cancel();
			syntheticTestCts.dispose();
		}

		syntheticTestCts = new vscode.CancellationTokenSource();
		const sessionId = `synth-${Date.now()}`;

		// Create session in synthetic mode (no mic capture)
		const provider = new TarxSpeechProvider(wsUrl);
		syntheticTestSession = provider.createSpeechToTextSession(syntheticTestCts.token, { syntheticMode: true });

		// Wait for WebSocket connection
		await new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);
			const checkConnection = setInterval(() => {
				if (syntheticTestSession?.isWebSocketConnected) {
					clearInterval(checkConnection);
					clearTimeout(timeout);
					resolve();
				}
			}, 100);
		});

		console.log(`[TARX Synthetic] Started test session: ${sessionId}`);

		return { success: true, sessionId };
	} catch (error) {
		return {
			success: false,
			sessionId: '',
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

/**
 * Inject synthetic audio into the active test session
 * @param audioData Raw PCM audio data (48kHz mono 32-bit, matching macOS output)
 * @param options Injection options
 */
export async function injectSyntheticAudio(audioData: Buffer, options?: {
	chunkSize?: number;
	chunkDelayMs?: number;
}): Promise<{
	success: boolean;
	bytesSent: number;
	chunksent: number;
	error?: string;
}> {
	if (!syntheticTestSession) {
		return { success: false, bytesSent: 0, chunksent: 0, error: 'No active synthetic session' };
	}

	if (!syntheticTestSession.isWebSocketConnected) {
		return { success: false, bytesSent: 0, chunksent: 0, error: 'WebSocket not connected' };
	}

	try {
		// Send audio in chunks to simulate real streaming
		const chunkSize = options?.chunkSize ?? 16384; // ~340ms of audio at 48kHz
		const chunkDelayMs = options?.chunkDelayMs ?? 50;
		let bytesSent = 0;
		let chunksSent = 0;

		for (let i = 0; i < audioData.length; i += chunkSize) {
			const chunk = audioData.subarray(i, Math.min(i + chunkSize, audioData.length));
			const sent = syntheticTestSession.injectAudio(chunk);
			if (!sent) {
				return {
					success: false,
					bytesSent,
					chunksent: chunksSent,
					error: `Failed to send chunk at offset ${i}`
				};
			}
			bytesSent += chunk.length;
			chunksSent++;

			// Small delay between chunks to simulate real-time streaming
			if (chunkDelayMs > 0 && i + chunkSize < audioData.length) {
				await new Promise(resolve => setTimeout(resolve, chunkDelayMs));
			}
		}

		console.log(`[TARX Synthetic] Injected ${bytesSent} bytes (${chunksSent} chunks)`);
		return { success: true, bytesSent, chunksent: chunksSent };
	} catch (error) {
		return {
			success: false,
			bytesSent: 0,
			chunksent: 0,
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

/**
 * Stop the synthetic test session
 */
export function stopSyntheticVoiceSession(): void {
	if (syntheticTestCts) {
		syntheticTestCts.cancel();
		syntheticTestCts.dispose();
		syntheticTestCts = null;
	}
	syntheticTestSession = null;
	console.log('[TARX Synthetic] Test session stopped');
}

/**
 * Get the transcript panel for monitoring UI updates
 */
export function getActiveTranscriptPanel(): VoiceTranscriptPanel | null {
	return transcriptPanel;
}

/**
 * Register TARX as a speech provider
 * This enables all built-in voice features in VS Code
 */
export function registerSpeechProvider(context: vscode.ExtensionContext): void {
	const config = vscode.workspace.getConfiguration('tarx');
	const voiceUrl = config.get<string>('voiceUrl', 'ws://127.0.0.1:11439');

	const speechProvider = new TarxSpeechProvider(voiceUrl);

	try {
		// Check if speech API is available (proposed API)
		if (typeof (vscode as any).speech?.registerSpeechProvider === 'function') {
			const disposable = (vscode as any).speech.registerSpeechProvider('tarx', {
				metadata: {
					extension: { id: 'tarx.tarx', uuid: '' },
					displayName: 'TARX Voice (Moshi)'
				},
				// VS Code expects 'provide*' method names
				provideSpeechToTextSession: (token: vscode.CancellationToken) =>
					speechProvider.createSpeechToTextSession(token),
				provideTextToSpeechSession: (token: vscode.CancellationToken) =>
					speechProvider.createTextToSpeechSession(token),
				provideKeywordRecognitionSession: (token: vscode.CancellationToken) =>
					speechProvider.createKeywordRecognitionSession(token)
			});

			context.subscriptions.push(disposable);
			console.log('[TARX] Speech provider registered successfully');
		} else {
			console.log('[TARX] Speech API not available (proposed API may not be enabled)');
		}
	} catch (error) {
		console.error('[TARX] Failed to register speech provider:', error);
	}
}
