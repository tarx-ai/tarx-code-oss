/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  TARX Speech Provider
 *  Implements VS Code's ISpeechProvider to integrate with tarx-voice:11438 (Moshi)
 *  Enables native voice features throughout the IDE
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

// Browser API declarations (used in webview context)
declare const navigator: {
	mediaDevices: {
		getUserMedia(constraints: { audio: MediaStreamConstraints['audio'] }): Promise<MediaStream>;
	};
};

interface MediaStreamConstraints {
	audio?: boolean | {
		echoCancellation?: boolean;
		noiseSuppression?: boolean;
		autoGainControl?: boolean;
	};
}

interface MediaStream {
	getTracks(): MediaStreamTrack[];
}

interface MediaStreamTrack {
	stop(): void;
}

declare class MediaRecorder {
	static isTypeSupported(mimeType: string): boolean;
	constructor(stream: MediaStream, options?: { mimeType?: string });
	ondataavailable: ((event: { data: Blob }) => void) | null;
	onerror: ((event: Event) => void) | null;
	onstop: (() => void) | null;
	state: 'inactive' | 'recording' | 'paused';
	start(timeslice?: number): void;
	stop(): void;
}

/**
 * Message format from tarx-voice/Moshi
 */
interface MoshiMessage {
	type: 'transcript' | 'audio' | 'error' | 'status';
	text?: string;
	isPartial?: boolean;
	error?: string;
}

/**
 * TARX Speech Provider
 * Connects to tarx-voice WebSocket and provides speech-to-text via Moshi
 */
export class TarxSpeechProvider {
	private wsUrl: string;

	constructor(wsUrl: string = 'ws://127.0.0.1:11438') {
		this.wsUrl = wsUrl;
		console.log(`[TARX Speech] Provider initialized with ${wsUrl}`);
	}

	/**
	 * Create a speech-to-text session
	 */
	createSpeechToTextSession(
		token: vscode.CancellationToken
	): TarxSpeechToTextSession {
		return new TarxSpeechToTextSession(this.wsUrl, token);
	}

	/**
	 * Create a text-to-speech session (not implemented)
	 */
	createTextToSpeechSession(
		token: vscode.CancellationToken
	): TarxTextToSpeechSession {
		return new TarxTextToSpeechSession(this.wsUrl, token);
	}

	/**
	 * Create a keyword recognition session (not implemented)
	 */
	createKeywordRecognitionSession(
		token: vscode.CancellationToken
	): TarxKeywordRecognitionSession {
		return new TarxKeywordRecognitionSession(token);
	}
}

/**
 * Speech-to-Text Session
 * Handles WebSocket connection and audio streaming to Moshi
 */
class TarxSpeechToTextSession {
	private readonly _onDidChange = new vscode.EventEmitter<{
		status: number;
		text?: string;
	}>();
	readonly onDidChange = this._onDidChange.event;

	private ws: WebSocket | null = null;
	private mediaRecorder: MediaRecorder | null = null;
	private stream: MediaStream | null = null;

	constructor(
		private readonly wsUrl: string,
		private readonly token: vscode.CancellationToken
	) {
		this.start();
		token.onCancellationRequested(() => this.stop());
	}

	private async start(): Promise<void> {
		try {
			// Emit started status
			this._onDidChange.fire({ status: 1 }); // Started

			// Connect WebSocket
			await this.connectWebSocket();

			// Start audio capture
			await this.startAudioCapture();
		} catch (error) {
			console.error('[TARX Speech] Error starting session:', error);
			this._onDidChange.fire({ status: 5 }); // Error
		}
	}

	private connectWebSocket(): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				this.ws = new WebSocket(this.wsUrl);

				const timeout = setTimeout(() => {
					reject(new Error('WebSocket connection timeout'));
				}, 5000);

				this.ws.onopen = () => {
					clearTimeout(timeout);
					console.log('[TARX Speech] WebSocket connected');
					resolve();
				};

				this.ws.onmessage = (event) => {
					try {
						const msg: MoshiMessage = JSON.parse(event.data);
						this.handleMoshiMessage(msg);
					} catch (error) {
						console.error('[TARX Speech] Error parsing message:', error);
					}
				};

				this.ws.onerror = () => {
					clearTimeout(timeout);
					console.error('[TARX Speech] WebSocket error');
					this._onDidChange.fire({ status: 5 }); // Error
					reject(new Error('WebSocket error'));
				};

				this.ws.onclose = () => {
					console.log('[TARX Speech] WebSocket closed');
					this._onDidChange.fire({ status: 4 }); // Stopped
				};
			} catch (error) {
				reject(error);
			}
		});
	}

	private async startAudioCapture(): Promise<void> {
		try {
			// Request microphone
			this.stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true
				}
			});

			// Create MediaRecorder
			let mimeType = 'audio/webm;codecs=opus';
			if (!MediaRecorder.isTypeSupported(mimeType)) {
				mimeType = 'audio/webm';
			}

			this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });

			this.mediaRecorder.ondataavailable = (event) => {
				if (event.data.size > 0 && this.ws?.readyState === WebSocket.OPEN) {
					this.ws.send(event.data);
				}
			};

			this.mediaRecorder.start(100); // Send chunks every 100ms
			console.log('[TARX Speech] Audio capture started');
		} catch (error) {
			console.error('[TARX Speech] Error accessing microphone:', error);
			throw error;
		}
	}

	private handleMoshiMessage(msg: MoshiMessage): void {
		if (msg.type === 'transcript' && msg.text) {
			// Status 2 = Recognizing (partial), Status 3 = Recognized (final)
			const status = msg.isPartial ? 2 : 3;
			console.log(`[TARX Speech] ${msg.isPartial ? 'Recognizing' : 'Recognized'}: ${msg.text}`);
			this._onDidChange.fire({ status, text: msg.text });
		} else if (msg.type === 'error') {
			console.error('[TARX Speech] Moshi error:', msg.error);
			this._onDidChange.fire({ status: 5 }); // Error
		}
	}

	private stop(): void {
		// Stop MediaRecorder
		if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
			try {
				this.mediaRecorder.stop();
			} catch {
				// Ignore
			}
		}

		// Close WebSocket
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.close();
		}

		// Stop microphone
		if (this.stream) {
			this.stream.getTracks().forEach(track => track.stop());
		}

		this._onDidChange.fire({ status: 4 }); // Stopped
		console.log('[TARX Speech] Session stopped');
	}
}

/**
 * Text-to-Speech Session (placeholder)
 */
class TarxTextToSpeechSession {
	private readonly _onDidChange = new vscode.EventEmitter<{
		status: number;
		text?: string;
	}>();
	readonly onDidChange = this._onDidChange.event;

	constructor(
		private readonly wsUrl: string,
		private readonly token: vscode.CancellationToken
	) {
		// TTS not implemented yet
		console.log('[TARX Speech] TTS not implemented');
	}

	async synthesize(text: string): Promise<void> {
		// TODO: Implement when Moshi TTS is ready
		console.log('[TARX Speech] TTS synthesize:', text);
		this._onDidChange.fire({ status: 2 }); // Stopped
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

	constructor(private readonly token: vscode.CancellationToken) {
		// Keyword recognition not implemented
		console.log('[TARX Speech] Keyword recognition not implemented');
	}
}

/**
 * Register TARX as a speech provider
 * This enables all built-in voice features in VS Code
 */
export function registerSpeechProvider(context: vscode.ExtensionContext): void {
	const config = vscode.workspace.getConfiguration('tarx');
	const voiceUrl = config.get<string>('voiceUrl', 'ws://127.0.0.1:11438');

	const speechProvider = new TarxSpeechProvider(voiceUrl);

	try {
		// Check if speech API is available (proposed API)
		if (typeof (vscode as any).speech?.registerSpeechProvider === 'function') {
			const disposable = (vscode as any).speech.registerSpeechProvider('tarx', {
				metadata: {
					extension: { id: 'tarx.tarx', uuid: '' },
					displayName: 'TARX Voice (Moshi)'
				},
				createSpeechToTextSession: (token: vscode.CancellationToken) =>
					speechProvider.createSpeechToTextSession(token),
				createTextToSpeechSession: (token: vscode.CancellationToken) =>
					speechProvider.createTextToSpeechSession(token),
				createKeywordRecognitionSession: (token: vscode.CancellationToken) =>
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
