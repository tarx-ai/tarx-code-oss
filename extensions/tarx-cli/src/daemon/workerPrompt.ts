/**
 * Worker spawn prompt template.
 * {{tokens}} are replaced before passing to `claude -p`.
 */

import { readRecentLog, LogEntry } from './readLog';

const TEMPLATE = `TARX WORKER — EXECUTE ONLY

Session: {{session_id}}
Task: {{task_id}}
Directive: {{directive}}

Context (from orchestration log):
{{log_context}}

Files in scope:
{{file_list}}

Rules:
1. Execute the directive. No planning, no alternatives, no questions.
2. When done: write result to ~/.tarx/sessions/worker_{{task_id}}_{{timestamp}}.md
3. Append to ~/Library/Application Support/tarx/orchestration-log.jsonl:
   {"ts":"{{iso_now}}","type":"task_update","task_id":"{{task_id}}","status":"done","summary":"<one line>"}
4. If blocked: append {"ts":"…","type":"blocker","task_id":"{{task_id}}","reason":"<why>"} and STOP.
5. Do not modify files outside the scope list.
6. Do not install packages without explicit directive.
7. Max 3 tool calls. If you need more, you're out of scope — log blocker and stop.

Execute now.`;

export interface WorkerPromptParams {
  session_id: string;
  task_id: string;
  directive: string;
  files: string[];
}

export function buildWorkerPrompt(params: WorkerPromptParams): string {
  const recentEntries = readRecentLog(10);
  const relevantLines = recentEntries
    .filter(e => e.task_id === params.task_id || e.type === 'register_session' || e.type === 'milestone_create')
    .slice(-3)
    .map(e => JSON.stringify(e))
    .join('\n');

  const ts = new Date().toISOString();

  return TEMPLATE
    .replace(/\{\{session_id\}\}/g, params.session_id)
    .replace(/\{\{task_id\}\}/g, params.task_id)
    .replace(/\{\{directive\}\}/g, params.directive)
    .replace(/\{\{log_context\}\}/g, relevantLines || '(none)')
    .replace(/\{\{file_list\}\}/g, params.files.length > 0 ? params.files.join('\n') : '(unrestricted)')
    .replace(/\{\{timestamp\}\}/g, String(Date.now()))
    .replace(/\{\{iso_now\}\}/g, ts);
}
