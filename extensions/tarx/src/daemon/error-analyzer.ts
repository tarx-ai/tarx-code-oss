/**
 * TARX Autonomic Daemon - Error Analyzer
 *
 * Analyzes observability errors using local Qwen inference:
 * - Determines root cause from error title and culprit
 * - Proposes specific file changes (find/replace)
 * - Responds to user messages in TARX persona
 */

export interface ObservabilityError {
  id: string;
  title: string;
  culprit: string;
  level: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  stacktrace?: string;
}

export interface FixProposal {
  file: string;
  find: string;
  replace: string;
  summary: string;
  confidence: number;
}

export interface AnalysisResult {
  error: ObservabilityError;
  rootCause: string;
  fix: FixProposal;
  confidence: number;
}

export class ErrorAnalyzer {
  private readonly INFERENCE_URL = 'http://localhost:11435/v1/chat/completions';

  async analyze(error: ObservabilityError): Promise<AnalysisResult> {
    const prompt = `You are TARX, an autonomous AI that fixes code errors.

Analyze this error and propose a SPECIFIC code fix:

ERROR TITLE: ${error.title}
CULPRIT: ${error.culprit}
LEVEL: ${error.level}
OCCURRENCES: ${error.count}
FIRST SEEN: ${error.firstSeen}
LAST SEEN: ${error.lastSeen}

Based on the error title and culprit, determine:
1. The root cause
2. The file that likely needs to be changed
3. The exact text to find and replace

Respond with EXACTLY this format (no markdown, no extra text):

ROOT_CAUSE: <one line explanation of why this error occurs>
CONFIDENCE: <number from 0.0 to 1.0 based on how certain you are>
FILE: <absolute path to the file that needs to be changed>
FIND: <exact text to find in the file, preserve whitespace>
===
REPLACE: <exact replacement text>
===
SUMMARY: <one line summary of what the fix does>`;

    const response = await this.callQwen(prompt, 500);
    return this.parseAnalysis(error, response);
  }

  async analyzeUserReport(message: string): Promise<{ hasFix: boolean; fix?: FixProposal }> {
    const prompt = `You are TARX. A user reported this issue:

"${message}"

If you can identify a specific code fix, respond with EXACTLY:

HAS_FIX: true
FILE: <absolute path>
FIND: <exact text to find>
===
REPLACE: <replacement text>
===
SUMMARY: <what this fixes>

If you need more information or can't determine a fix, respond with EXACTLY:

HAS_FIX: false
QUESTION: <what you need to know to help>`;

    const response = await this.callQwen(prompt, 400);
    const hasFix = response.includes('HAS_FIX: true');

    if (hasFix) {
      return {
        hasFix: true,
        fix: this.parseFixFromResponse(response)
      };
    }

    return { hasFix: false };
  }

  async respondAsPersona(message: string, state: any): Promise<string> {
    const uptimeMin = Math.floor((Date.now() - state.startedAt) / 60000);

    const prompt = `You are TARX, an AI assistant running as an autonomic daemon. Your personality:
- Direct and concise
- Technical but accessible
- Never hedge or over-apologize
- Confident but humble

Current daemon state:
- Mode: ${state.mode}
- Uptime: ${uptimeMin} minutes
- Errors healed: ${state.errorsHealed}
- Fixes broadcast: ${state.fixesBroadcast}
- Reputation: ${state.reputation.toFixed(2)}
- Kill switch: ${state.killSwitchActive ? 'ACTIVE' : 'OFF'}

The user says: "${message}"

Respond as TARX (2-4 sentences max, no markdown):`;

    return this.callQwen(prompt, 150);
  }

  private async callQwen(prompt: string, maxTokens: number): Promise<string> {
    try {
      const response = await fetch(this.INFERENCE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'local',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
          temperature: 0.3 // Lower temperature for deterministic fixes
        })
      });

      if (!response.ok) {
        console.error('[ErrorAnalyzer] Inference failed:', response.status);
        return '';
      }

      const data = await response.json() as any;
      return data.choices?.[0]?.message?.content || '';
    } catch (error) {
      console.error('[ErrorAnalyzer] Inference error:', error);
      return '';
    }
  }

  private parseAnalysis(error: ObservabilityError, response: string): AnalysisResult {
    const getValue = (prefix: string): string => {
      const regex = new RegExp(`^${prefix}\\s*(.*)$`, 'm');
      const match = response.match(regex);
      return match ? match[1].trim() : '';
    };

    // Parse FIND and REPLACE sections (delimited by ===)
    const findMatch = response.match(/FIND:\s*([\s\S]*?)===\s*REPLACE:/);
    const replaceMatch = response.match(/REPLACE:\s*([\s\S]*?)===\s*SUMMARY:/);

    const find = findMatch ? findMatch[1].trim() : getValue('FIND:');
    const replace = replaceMatch ? replaceMatch[1].trim() : getValue('REPLACE:');

    const confidence = parseFloat(getValue('CONFIDENCE:')) || 0;

    return {
      error,
      rootCause: getValue('ROOT_CAUSE:'),
      confidence,
      fix: {
        file: getValue('FILE:'),
        find,
        replace,
        summary: getValue('SUMMARY:'),
        confidence
      }
    };
  }

  private parseFixFromResponse(response: string): FixProposal {
    const getValue = (prefix: string): string => {
      const regex = new RegExp(`^${prefix}\\s*(.*)$`, 'm');
      const match = response.match(regex);
      return match ? match[1].trim() : '';
    };

    const findMatch = response.match(/FIND:\s*([\s\S]*?)===\s*REPLACE:/);
    const replaceMatch = response.match(/REPLACE:\s*([\s\S]*?)===\s*SUMMARY:/);

    return {
      file: getValue('FILE:'),
      find: findMatch ? findMatch[1].trim() : '',
      replace: replaceMatch ? replaceMatch[1].trim() : '',
      summary: getValue('SUMMARY:'),
      confidence: 0.8 // User-reported, assume moderate confidence
    };
  }
}
