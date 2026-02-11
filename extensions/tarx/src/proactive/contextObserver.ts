/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Context Observer - Monitors code changes, voice patterns, editor activity, and time signals
 *
 * This service observes ambient context without requiring explicit user input.
 * It feeds signals to the PatternDetector for classification.
 */

import * as vscode from 'vscode';
import { EventEmitter } from 'events';

// ========================================
// Interfaces
// ========================================

export interface IVoicePattern {
  recentUtterances: string[];
  averageConfidence: number;
  silenceDuration: number; // ms since last voice input
  frustrationIndicators: number; // count of frustrated phrases
  questionCount: number;
}

export interface IEditorActivity {
  fileChanges: number; // in last 5 min
  cursorMovements: number;
  undoCount: number;
  sameLineEdits: number; // repeated edits to same location
  currentFile: string;
  currentLanguage: string;
  selectionLength: number;
}

export interface ITimeSignals {
  sessionDuration: number; // ms since session start
  timeSinceLastAction: number; // ms since last user action
  timeOnCurrentFile: number; // ms on current file
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
}

export interface IDiagnosticContext {
  errorCount: number;
  warningCount: number;
  recentErrors: string[];
  sameErrorRepeated: number; // same error appearing multiple times
}

export interface IAmbientContext {
  currentFile: string;
  codeContext: string;
  chatHistory: string[];
  voicePattern: IVoicePattern;
  editorActivity: IEditorActivity;
  timeSignals: ITimeSignals;
  diagnostics: IDiagnosticContext;
  timestamp: number;
}

export interface IContextSignal {
  type: 'code_change' | 'voice_input' | 'editor_activity' | 'time_tick' | 'diagnostic_change';
  data: any;
  timestamp: number;
}

// ========================================
// Context Observer Service
// ========================================

export class ContextObserverService extends EventEmitter {
  private context: IAmbientContext;
  private disposables: vscode.Disposable[] = [];
  private sessionStart: number;
  private lastActionTime: number;
  private fileOpenTime: number;
  private recentEdits: { line: number; time: number }[] = [];
  private chatHistory: string[] = [];
  private voiceUtterances: { text: string; confidence: number; time: number }[] = [];
  private diagnosticHistory: Map<string, number> = new Map(); // error -> count

  constructor() {
    super();
    this.sessionStart = Date.now();
    this.lastActionTime = Date.now();
    this.fileOpenTime = Date.now();
    this.context = this.createEmptyContext();

    console.log('[TARX ContextObserver] Initialized');
  }

  /**
   * Start observing context
   */
  start(): void {
    // Watch text document changes
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(this.onDocumentChange.bind(this))
    );

    // Watch cursor movements
    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection(this.onSelectionChange.bind(this))
    );

    // Watch active editor changes
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(this.onActiveEditorChange.bind(this))
    );

    // Watch diagnostics (errors/warnings)
    this.disposables.push(
      vscode.languages.onDidChangeDiagnostics(this.onDiagnosticsChange.bind(this))
    );

    // Time tick every 10 seconds
    const timeInterval = setInterval(() => {
      this.updateTimeSignals();
      this.emitSignal('time_tick', this.context.timeSignals);
    }, 10000);

    this.disposables.push({
      dispose: () => clearInterval(timeInterval)
    });

    console.log('[TARX ContextObserver] Started observing');
  }

  /**
   * Stop observing
   */
  stop(): void {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
    console.log('[TARX ContextObserver] Stopped');
  }

  /**
   * Get current ambient context
   */
  getContext(): IAmbientContext {
    this.updateContext();
    return { ...this.context };
  }

  /**
   * Record voice input for pattern detection
   */
  recordVoiceInput(text: string, confidence: number): void {
    this.voiceUtterances.push({
      text,
      confidence,
      time: Date.now()
    });

    // Keep last 10 utterances
    if (this.voiceUtterances.length > 10) {
      this.voiceUtterances.shift();
    }

    this.updateVoicePattern();
    this.lastActionTime = Date.now();
    this.emitSignal('voice_input', { text, confidence });
  }

  /**
   * Record chat message for context
   */
  recordChatMessage(message: string, role: 'user' | 'assistant'): void {
    this.chatHistory.push(`${role}: ${message.slice(0, 200)}`);

    // Keep last 20 messages
    if (this.chatHistory.length > 20) {
      this.chatHistory.shift();
    }
  }

  // ========================================
  // Private Methods
  // ========================================

  private createEmptyContext(): IAmbientContext {
    return {
      currentFile: '',
      codeContext: '',
      chatHistory: [],
      voicePattern: {
        recentUtterances: [],
        averageConfidence: 1.0,
        silenceDuration: 0,
        frustrationIndicators: 0,
        questionCount: 0
      },
      editorActivity: {
        fileChanges: 0,
        cursorMovements: 0,
        undoCount: 0,
        sameLineEdits: 0,
        currentFile: '',
        currentLanguage: '',
        selectionLength: 0
      },
      timeSignals: {
        sessionDuration: 0,
        timeSinceLastAction: 0,
        timeOnCurrentFile: 0,
        timeOfDay: this.getTimeOfDay()
      },
      diagnostics: {
        errorCount: 0,
        warningCount: 0,
        recentErrors: [],
        sameErrorRepeated: 0
      },
      timestamp: Date.now()
    };
  }

  private updateContext(): void {
    const editor = vscode.window.activeTextEditor;

    if (editor) {
      this.context.currentFile = editor.document.fileName;
      this.context.editorActivity.currentFile = editor.document.fileName;
      this.context.editorActivity.currentLanguage = editor.document.languageId;
      this.context.editorActivity.selectionLength = editor.selection.isEmpty
        ? 0
        : editor.document.getText(editor.selection).length;

      // Get code around cursor
      const position = editor.selection.active;
      const startLine = Math.max(0, position.line - 10);
      const endLine = Math.min(editor.document.lineCount - 1, position.line + 10);
      const range = new vscode.Range(startLine, 0, endLine, editor.document.lineAt(endLine).text.length);
      this.context.codeContext = editor.document.getText(range);
    }

    this.context.chatHistory = [...this.chatHistory];
    this.updateTimeSignals();
    this.updateVoicePattern();
    this.context.timestamp = Date.now();
  }

  private updateTimeSignals(): void {
    const now = Date.now();
    this.context.timeSignals = {
      sessionDuration: now - this.sessionStart,
      timeSinceLastAction: now - this.lastActionTime,
      timeOnCurrentFile: now - this.fileOpenTime,
      timeOfDay: this.getTimeOfDay()
    };
  }

  private updateVoicePattern(): void {
    const now = Date.now();
    const recentUtterances = this.voiceUtterances
      .filter(u => now - u.time < 300000) // last 5 min
      .map(u => u.text);

    const avgConfidence = this.voiceUtterances.length > 0
      ? this.voiceUtterances.reduce((sum, u) => sum + u.confidence, 0) / this.voiceUtterances.length
      : 1.0;

    const lastVoice = this.voiceUtterances[this.voiceUtterances.length - 1];
    const silenceDuration = lastVoice ? now - lastVoice.time : now - this.sessionStart;

    // Count frustration indicators
    const frustrationPhrases = [
      'not working', 'doesn\'t work', 'still broken', 'same error',
      'why', 'again', 'stuck', 'help', 'ugh', 'damn', 'crap'
    ];
    const frustrationIndicators = recentUtterances.filter(u =>
      frustrationPhrases.some(p => u.toLowerCase().includes(p))
    ).length;

    // Count questions
    const questionCount = recentUtterances.filter(u =>
      u.includes('?') || u.toLowerCase().startsWith('how') ||
      u.toLowerCase().startsWith('why') || u.toLowerCase().startsWith('what')
    ).length;

    this.context.voicePattern = {
      recentUtterances,
      averageConfidence: avgConfidence,
      silenceDuration,
      frustrationIndicators,
      questionCount
    };
  }

  private getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  private onDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    this.context.editorActivity.fileChanges++;
    this.lastActionTime = Date.now();

    // Track repeated edits to same line
    for (const change of event.contentChanges) {
      const line = change.range.start.line;
      const now = Date.now();

      // Check if editing same line recently
      const recentSameLineEdits = this.recentEdits.filter(
        e => e.line === line && now - e.time < 30000
      ).length;

      if (recentSameLineEdits > 0) {
        this.context.editorActivity.sameLineEdits++;
      }

      this.recentEdits.push({ line, time: now });
    }

    // Keep last 50 edits
    if (this.recentEdits.length > 50) {
      this.recentEdits = this.recentEdits.slice(-50);
    }

    this.emitSignal('code_change', {
      file: event.document.fileName,
      changes: event.contentChanges.length
    });
  }

  private onSelectionChange(event: vscode.TextEditorSelectionChangeEvent): void {
    this.context.editorActivity.cursorMovements++;
    this.lastActionTime = Date.now();

    this.emitSignal('editor_activity', {
      type: 'selection',
      file: event.textEditor.document.fileName
    });
  }

  private onActiveEditorChange(editor: vscode.TextEditor | undefined): void {
    if (editor) {
      this.fileOpenTime = Date.now();
      this.context.currentFile = editor.document.fileName;
      this.context.editorActivity.currentFile = editor.document.fileName;
      this.context.editorActivity.currentLanguage = editor.document.languageId;
      this.lastActionTime = Date.now();

      this.emitSignal('editor_activity', {
        type: 'file_change',
        file: editor.document.fileName
      });
    }
  }

  private onDiagnosticsChange(event: vscode.DiagnosticChangeEvent): void {
    let errorCount = 0;
    let warningCount = 0;
    const recentErrors: string[] = [];

    for (const uri of event.uris) {
      const diagnostics = vscode.languages.getDiagnostics(uri);
      for (const diagnostic of diagnostics) {
        if (diagnostic.severity === vscode.DiagnosticSeverity.Error) {
          errorCount++;
          const errorKey = diagnostic.message.slice(0, 100);
          recentErrors.push(errorKey);

          // Track repeated errors
          const count = this.diagnosticHistory.get(errorKey) || 0;
          this.diagnosticHistory.set(errorKey, count + 1);
        } else if (diagnostic.severity === vscode.DiagnosticSeverity.Warning) {
          warningCount++;
        }
      }
    }

    // Calculate same error repeated
    const sameErrorRepeated = Math.max(
      0,
      ...Array.from(this.diagnosticHistory.values())
    );

    this.context.diagnostics = {
      errorCount,
      warningCount,
      recentErrors: recentErrors.slice(0, 5),
      sameErrorRepeated
    };

    this.emitSignal('diagnostic_change', this.context.diagnostics);
  }

  private emitSignal(type: IContextSignal['type'], data: any): void {
    const signal: IContextSignal = {
      type,
      data,
      timestamp: Date.now()
    };
    this.emit('signal', signal);
  }

  dispose(): void {
    this.stop();
  }
}

// Export singleton factory
let instance: ContextObserverService | null = null;

export function getContextObserver(): ContextObserverService {
  if (!instance) {
    instance = new ContextObserverService();
  }
  return instance;
}
