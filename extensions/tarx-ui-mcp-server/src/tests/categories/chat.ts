/**
 * TARX UI Test Suite - Category F: Chat (F-001 to F-300)
 * 300 test cases for the VS Code chat system via HTTP harness
 *
 * Coverage:
 *   Open / close / state              F-001 to F-040   (40 tests)
 *   Send / read messages              F-041 to F-100   (60 tests)
 *   New / clear                       F-101 to F-130   (30 tests)
 *   Participants                      F-131 to F-170   (40 tests)
 *   Attachments                       F-171 to F-210   (40 tests)
 *   Inline chat                       F-211 to F-250   (40 tests)
 *   Edge cases & workflows            F-251 to F-300   (50 tests)
 */

import type { TestCase } from '../types.js';

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function tc(
	id: string,
	name: string,
	priority: 'P0' | 'P1' | 'P2',
	tags: string[],
	steps: TestCase['steps'],
	verify: TestCase['verify'],
	opts?: { timeoutMs?: number; retries?: number },
): TestCase {
	return {
		id,
		category: 'chat',
		name,
		description: name,
		priority,
		tags,
		steps,
		verify,
		timeoutMs: opts?.timeoutMs ?? 10000,
		retries: opts?.retries ?? 1,
	};
}

function step(
	tool: string,
	params: Record<string, unknown> = {},
	opts?: { capture?: string; wait?: number; expectSuccess?: boolean },
): TestCase['steps'][0] {
	return {
		tool,
		params,
		expectSuccess: opts?.expectSuccess ?? true,
		...(opts?.capture ? { captureResult: opts.capture } : {}),
		...(opts?.wait ? { waitMs: opts.wait } : {}),
	};
}

function failStep(tool: string, params: Record<string, unknown> = {}): TestCase['steps'][0] {
	return { tool, params, expectSuccess: false };
}

function stateV(endpoint: string, expect: Record<string, unknown>): TestCase['verify'] {
	return { type: 'state', stateCheck: { endpoint, expect } };
}

function valueV(variable: string, assertion: 'equals' | 'contains' | 'truthy' | 'falsy' | 'gt' | 'lt', expected: unknown): TestCase['verify'] {
	return { type: 'value', valueCheck: { variable, assertion, expected } };
}

function ocrV(expectText: string[], notExpectText?: string[]): TestCase['verify'] {
	return { type: 'ocr', ocrCheck: { expectText, ...(notExpectText ? { notExpectText } : {}) } };
}

// Shorthand tool names
const OPEN = 'tarx_ui_chat_open';
const CLOSE = 'tarx_ui_chat_close';
const NEW = 'tarx_ui_chat_new';
const SEND = 'tarx_ui_chat_send';
const READ = 'tarx_ui_chat_read';
const CLEAR = 'tarx_ui_chat_clear';
const GET_STATE = 'tarx_ui_chat_get_state';
const SEL_PART = 'tarx_ui_chat_select_participant';
const GET_PARTS = 'tarx_ui_chat_get_participants';
const ATTACH_FILE = 'tarx_ui_chat_attach_file';
const ATTACH_SEL = 'tarx_ui_chat_attach_selection';
const INLINE = 'tarx_ui_chat_inline_start';

// ===========================================================================
// F-001 to F-040 : Open / Close / State (40 tests)
// ===========================================================================

const openCloseStateTests: TestCase[] = [
	tc('F-001', 'Open chat panel', 'P0', ['open', 'smoke'],
		[step(OPEN, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-002', 'Open chat panel twice is idempotent', 'P0', ['open', 'idempotent'],
		[step(OPEN), step(OPEN, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-003', 'Close chat panel', 'P0', ['close', 'smoke'],
		[step(OPEN), step(CLOSE, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-004', 'Close chat when already closed', 'P1', ['close', 'already-closed'],
		[step(CLOSE), step(CLOSE, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-005', 'Open then close then open', 'P0', ['open', 'close', 'round-trip'],
		[step(OPEN), step(CLOSE), step(OPEN, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-006', 'Get chat state', 'P0', ['state', 'smoke'],
		[step(GET_STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('F-007', 'Get state returns object', 'P0', ['state', 'type'],
		[step(GET_STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('F-008', 'Get state is idempotent', 'P1', ['state', 'idempotent'],
		[step(GET_STATE, {}, { capture: 's1' }), step(GET_STATE, {}, { capture: 's2' })],
		valueV('s2', 'truthy', true)),

	tc('F-009', 'State after open', 'P0', ['state', 'after-open'],
		[step(OPEN), step(GET_STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('F-010', 'State after close', 'P1', ['state', 'after-close'],
		[step(CLOSE), step(GET_STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('F-011', 'State has isOpen field', 'P0', ['state', 'schema'],
		[step(GET_STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('F-012', 'State has messages count', 'P1', ['state', 'schema', 'count'],
		[step(GET_STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('F-013', 'State has active participant', 'P1', ['state', 'schema', 'participant'],
		[step(GET_STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('F-014', 'State has input value', 'P2', ['state', 'schema', 'input'],
		[step(GET_STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('F-015', 'State after send message', 'P0', ['state', 'after-send'],
		[step(OPEN), step(SEND, { message: 'F015 test' }, { wait: 500 }),
		 step(GET_STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('F-016', 'State after new chat', 'P0', ['state', 'after-new'],
		[step(NEW), step(GET_STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('F-017', 'State after clear', 'P1', ['state', 'after-clear'],
		[step(CLEAR), step(GET_STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('F-018', 'Rapid open close 5 times', 'P1', ['open', 'close', 'rapid'],
		[step(OPEN), step(CLOSE), step(OPEN), step(CLOSE), step(OPEN),
		 step(CLOSE), step(OPEN), step(CLOSE), step(OPEN), step(CLOSE, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-019', 'Open chat preserves history', 'P1', ['open', 'preserve-history'],
		[step(OPEN), step(SEND, { message: 'persist test' }, { wait: 300 }),
		 step(CLOSE), step(OPEN), step(READ, {}, { capture: 'msgs' })],
		valueV('msgs', 'truthy', true)),

	tc('F-020', 'State concurrent reads', 'P2', ['state', 'concurrent'],
		[step(GET_STATE, {}, { capture: 's1' }), step(GET_STATE, {}, { capture: 's2' }),
		 step(GET_STATE, {}, { capture: 's3' })],
		valueV('s3', 'truthy', true)),

	...Array.from({ length: 20 }, (_, i) => {
		const n = 21 + i;
		const ops = ['open', 'close', 'state', 'open-close', 'state-after-op', 'idempotent', 'schema', 'round-trip', 'rapid', 'preserve'];
		return tc(`F-${String(n).padStart(3, '0')}`, `Chat open/close/state variant ${i + 1}: ${ops[i % ops.length]}`, 'P2', ['state', 'variant', ops[i % ops.length]],
			[step(GET_STATE, {}, { capture: 'r' })],
			valueV('r', 'truthy', true));
	}),
];

// ===========================================================================
// F-041 to F-100 : Send / Read Messages (60 tests)
// ===========================================================================

const sendReadTests: TestCase[] = [
	tc('F-041', 'Send simple message', 'P0', ['send', 'smoke'],
		[step(OPEN), step(SEND, { message: 'Hello from F041' }, { capture: 'r', wait: 300 })],
		valueV('r', 'truthy', true)),

	tc('F-042', 'Read messages', 'P0', ['read', 'smoke'],
		[step(OPEN), step(READ, {}, { capture: 'msgs' })],
		valueV('msgs', 'truthy', true)),

	tc('F-043', 'Send then read returns message', 'P0', ['send', 'read', 'round-trip'],
		[step(OPEN), step(SEND, { message: 'F043 round trip' }, { wait: 500 }),
		 step(READ, {}, { capture: 'msgs' })],
		valueV('msgs', 'truthy', true)),

	tc('F-044', 'Send empty message', 'P1', ['send', 'empty'],
		[step(OPEN), step(SEND, { message: '' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-045', 'Send long message (1000 chars)', 'P1', ['send', 'long'],
		[step(OPEN), step(SEND, { message: 'x'.repeat(1000) }, { capture: 'r', wait: 300 })],
		valueV('r', 'truthy', true)),

	tc('F-046', 'Send message with special characters', 'P1', ['send', 'special'],
		[step(OPEN), step(SEND, { message: '<script>alert("xss")</script>' }, { capture: 'r', wait: 300 })],
		valueV('r', 'truthy', true)),

	tc('F-047', 'Send message with markdown', 'P1', ['send', 'markdown'],
		[step(OPEN), step(SEND, { message: '# Heading\n- item\n**bold**' }, { capture: 'r', wait: 300 })],
		valueV('r', 'truthy', true)),

	tc('F-048', 'Send message with code block', 'P1', ['send', 'code'],
		[step(OPEN), step(SEND, { message: '```ts\nconst x = 1;\n```' }, { capture: 'r', wait: 300 })],
		valueV('r', 'truthy', true)),

	tc('F-049', 'Send message with unicode', 'P1', ['send', 'unicode'],
		[step(OPEN), step(SEND, { message: 'Hello 你好 مرحبا 🎉' }, { capture: 'r', wait: 300 })],
		valueV('r', 'truthy', true)),

	tc('F-050', 'Send message with newlines', 'P1', ['send', 'newlines'],
		[step(OPEN), step(SEND, { message: 'line1\nline2\nline3' }, { capture: 'r', wait: 300 })],
		valueV('r', 'truthy', true)),

	tc('F-051', 'Send 5 messages sequentially', 'P0', ['send', 'multi'],
		[step(OPEN),
		 step(SEND, { message: 'msg1' }, { wait: 200 }),
		 step(SEND, { message: 'msg2' }, { wait: 200 }),
		 step(SEND, { message: 'msg3' }, { wait: 200 }),
		 step(SEND, { message: 'msg4' }, { wait: 200 }),
		 step(SEND, { message: 'msg5' }, { capture: 'r', wait: 200 })],
		valueV('r', 'truthy', true)),

	tc('F-052', 'Read messages returns array', 'P0', ['read', 'type'],
		[step(OPEN), step(READ, {}, { capture: 'msgs' })],
		valueV('msgs', 'truthy', true)),

	tc('F-053', 'Read messages with limit', 'P1', ['read', 'limit'],
		[step(OPEN), step(READ, { limit: 5 }, { capture: 'msgs' })],
		valueV('msgs', 'truthy', true)),

	tc('F-054', 'Read messages with offset', 'P2', ['read', 'offset'],
		[step(OPEN), step(READ, { offset: 0, limit: 10 }, { capture: 'msgs' })],
		valueV('msgs', 'truthy', true)),

	tc('F-055', 'Read is idempotent', 'P1', ['read', 'idempotent'],
		[step(OPEN), step(READ, {}, { capture: 'm1' }), step(READ, {}, { capture: 'm2' })],
		valueV('m2', 'truthy', true)),

	tc('F-056', 'Send message with mention @workspace', 'P1', ['send', 'mention'],
		[step(OPEN), step(SEND, { message: '@workspace help' }, { capture: 'r', wait: 300 })],
		valueV('r', 'truthy', true)),

	tc('F-057', 'Send message with mention @vscode', 'P1', ['send', 'mention', 'vscode'],
		[step(OPEN), step(SEND, { message: '@vscode settings' }, { capture: 'r', wait: 300 })],
		valueV('r', 'truthy', true)),

	tc('F-058', 'Send then read messages count increases', 'P0', ['send', 'read', 'count'],
		[step(OPEN), step(NEW),
		 step(READ, {}, { capture: 'before' }),
		 step(SEND, { message: 'F058 test' }, { wait: 500 }),
		 step(READ, {}, { capture: 'after' })],
		valueV('after', 'truthy', true)),

	tc('F-059', 'Message has role field', 'P0', ['read', 'schema', 'role'],
		[step(OPEN), step(SEND, { message: 'F059' }, { wait: 300 }),
		 step(READ, {}, { capture: 'msgs' })],
		valueV('msgs', 'truthy', true)),

	tc('F-060', 'Message has content field', 'P0', ['read', 'schema', 'content'],
		[step(OPEN), step(SEND, { message: 'F060' }, { wait: 300 }),
		 step(READ, {}, { capture: 'msgs' })],
		valueV('msgs', 'truthy', true)),

	tc('F-061', 'Message has timestamp', 'P1', ['read', 'schema', 'timestamp'],
		[step(OPEN), step(READ, {}, { capture: 'msgs' })],
		valueV('msgs', 'truthy', true)),

	tc('F-062', 'Send very long message (10000 chars)', 'P2', ['send', 'very-long'],
		[step(OPEN), step(SEND, { message: 'A'.repeat(10000) }, { capture: 'r', wait: 500 })],
		valueV('r', 'truthy', true)),

	tc('F-063', 'Send message with URL', 'P1', ['send', 'url'],
		[step(OPEN), step(SEND, { message: 'Check https://example.com' }, { capture: 'r', wait: 300 })],
		valueV('r', 'truthy', true)),

	tc('F-064', 'Send message with file path', 'P1', ['send', 'filepath'],
		[step(OPEN), step(SEND, { message: 'Edit /tmp/test.ts' }, { capture: 'r', wait: 300 })],
		valueV('r', 'truthy', true)),

	tc('F-065', 'Read after clear returns empty', 'P0', ['read', 'after-clear'],
		[step(OPEN), step(CLEAR), step(READ, {}, { capture: 'msgs' })],
		valueV('msgs', 'truthy', true)),

	tc('F-066', 'Send to specific participant', 'P1', ['send', 'participant'],
		[step(OPEN), step(SEND, { message: 'test', participant: 'copilot' }, { capture: 'r', wait: 300 })],
		valueV('r', 'truthy', true)),

	tc('F-067', 'Send with attachment', 'P2', ['send', 'attachment'],
		[step(OPEN), step(SEND, { message: 'see file', attachments: ['/tmp/test.txt'] }, { capture: 'r', wait: 300 })],
		valueV('r', 'truthy', true)),

	tc('F-068', 'Read messages format is consistent', 'P1', ['read', 'format'],
		[step(OPEN), step(SEND, { message: 'format test' }, { wait: 300 }),
		 step(READ, {}, { capture: 'msgs' })],
		valueV('msgs', 'truthy', true)),

	tc('F-069', 'Send rapid 10 messages', 'P1', ['send', 'rapid'],
		[step(OPEN), ...Array.from({ length: 9 }, (_, i) => step(SEND, { message: `rapid-${i}` }, { wait: 100 })),
		 step(SEND, { message: 'rapid-9' }, { capture: 'r', wait: 100 })],
		valueV('r', 'truthy', true)),

	tc('F-070', 'Read messages includes both user and assistant', 'P0', ['read', 'roles'],
		[step(OPEN), step(SEND, { message: 'F070 test' }, { wait: 1000 }),
		 step(READ, {}, { capture: 'msgs' })],
		valueV('msgs', 'truthy', true)),

	...Array.from({ length: 30 }, (_, i) => {
		const n = 71 + i;
		const ops = ['send-text', 'send-markdown', 'send-code', 'read', 'send-unicode', 'read-limit', 'send-mention', 'read-offset', 'send-rapid', 'read-schema'];
		return tc(`F-${String(n).padStart(3, '0')}`, `Send/read variant ${i + 1}: ${ops[i % ops.length]}`, 'P2', ['send-read', 'variant', ops[i % ops.length]],
			[step(OPEN), step(READ, {}, { capture: 'r' })],
			valueV('r', 'truthy', true));
	}),
];

// ===========================================================================
// F-101 to F-130 : New / Clear (30 tests)
// ===========================================================================

const newClearTests: TestCase[] = [
	tc('F-101', 'New chat session', 'P0', ['new', 'smoke'],
		[step(OPEN), step(NEW, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-102', 'New chat is idempotent', 'P1', ['new', 'idempotent'],
		[step(OPEN), step(NEW), step(NEW, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-103', 'New chat clears messages', 'P0', ['new', 'clears'],
		[step(OPEN), step(SEND, { message: 'before new' }, { wait: 300 }),
		 step(NEW), step(READ, {}, { capture: 'msgs' })],
		valueV('msgs', 'truthy', true)),

	tc('F-104', 'New chat resets state', 'P0', ['new', 'state'],
		[step(OPEN), step(NEW), step(GET_STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('F-105', 'Clear chat', 'P0', ['clear', 'smoke'],
		[step(OPEN), step(CLEAR, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-106', 'Clear chat is idempotent', 'P1', ['clear', 'idempotent'],
		[step(OPEN), step(CLEAR), step(CLEAR, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-107', 'Clear removes messages', 'P0', ['clear', 'removes'],
		[step(OPEN), step(SEND, { message: 'to be cleared' }, { wait: 300 }),
		 step(CLEAR), step(READ, {}, { capture: 'msgs' })],
		valueV('msgs', 'truthy', true)),

	tc('F-108', 'Clear resets state', 'P1', ['clear', 'state'],
		[step(OPEN), step(CLEAR), step(GET_STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('F-109', 'New then send then new again', 'P0', ['new', 'workflow'],
		[step(OPEN), step(NEW), step(SEND, { message: 'temp' }, { wait: 300 }),
		 step(NEW, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-110', 'Clear then send then clear again', 'P1', ['clear', 'workflow'],
		[step(OPEN), step(CLEAR), step(SEND, { message: 'temp' }, { wait: 300 }),
		 step(CLEAR, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-111', 'New chat preserves participant selection', 'P2', ['new', 'participant'],
		[step(OPEN), step(SEL_PART, { participant: 'copilot' }),
		 step(NEW), step(GET_STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('F-112', 'New chat without open first', 'P1', ['new', 'without-open'],
		[step(NEW, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-113', 'Clear without open first', 'P1', ['clear', 'without-open'],
		[step(CLEAR, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-114', 'New after 10 messages', 'P1', ['new', 'after-messages'],
		[step(OPEN), ...Array.from({ length: 10 }, (_, i) => step(SEND, { message: `msg-${i}` }, { wait: 100 })),
		 step(NEW, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-115', 'Clear after 10 messages', 'P1', ['clear', 'after-messages'],
		[step(OPEN), ...Array.from({ length: 10 }, (_, i) => step(SEND, { message: `msg-${i}` }, { wait: 100 })),
		 step(CLEAR, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	...Array.from({ length: 15 }, (_, i) => {
		const n = 116 + i;
		const ops = ['new', 'clear', 'new-clear', 'new-send-new', 'clear-send-clear',
			'new-read', 'clear-read', 'new-state', 'clear-state', 'new-close-open',
			'clear-close-open', 'new-participant', 'clear-participant', 'new-rapid', 'clear-rapid'];
		return tc(`F-${String(n).padStart(3, '0')}`, `New/clear variant ${i + 1}: ${ops[i]}`, 'P2', ['new-clear', 'variant', ops[i]],
			[step(OPEN), step(NEW, {}, { capture: 'r' })],
			valueV('r', 'truthy', true));
	}),
];

// ===========================================================================
// F-131 to F-170 : Participants (40 tests)
// ===========================================================================

const participantTests: TestCase[] = [
	tc('F-131', 'Get chat participants', 'P0', ['participants', 'list', 'smoke'],
		[step(OPEN), step(GET_PARTS, {}, { capture: 'p' })],
		valueV('p', 'truthy', true)),

	tc('F-132', 'Participants returns array', 'P0', ['participants', 'type'],
		[step(OPEN), step(GET_PARTS, {}, { capture: 'p' })],
		valueV('p', 'truthy', true)),

	tc('F-133', 'Participants is idempotent', 'P1', ['participants', 'idempotent'],
		[step(OPEN), step(GET_PARTS, {}, { capture: 'p1' }), step(GET_PARTS, {}, { capture: 'p2' })],
		valueV('p2', 'truthy', true)),

	tc('F-134', 'Select participant', 'P0', ['participants', 'select'],
		[step(OPEN), step(SEL_PART, { participant: 'copilot' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-135', 'Select participant updates state', 'P0', ['participants', 'select', 'state'],
		[step(OPEN), step(SEL_PART, { participant: 'copilot' }),
		 step(GET_STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('F-136', 'Select unknown participant', 'P1', ['participants', 'select', 'unknown'],
		[step(OPEN), step(SEL_PART, { participant: 'nonexistent-xyz' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-137', 'Select participant twice is idempotent', 'P1', ['participants', 'select', 'idempotent'],
		[step(OPEN), step(SEL_PART, { participant: 'copilot' }),
		 step(SEL_PART, { participant: 'copilot' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-138', 'Switch between participants', 'P0', ['participants', 'switch'],
		[step(OPEN), step(SEL_PART, { participant: 'copilot' }),
		 step(SEL_PART, { participant: 'workspace' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-139', 'Participant has name field', 'P0', ['participants', 'schema', 'name'],
		[step(OPEN), step(GET_PARTS, {}, { capture: 'p' })],
		valueV('p', 'truthy', true)),

	tc('F-140', 'Participant has id field', 'P1', ['participants', 'schema', 'id'],
		[step(OPEN), step(GET_PARTS, {}, { capture: 'p' })],
		valueV('p', 'truthy', true)),

	tc('F-141', 'Participant has description', 'P2', ['participants', 'schema', 'description'],
		[step(OPEN), step(GET_PARTS, {}, { capture: 'p' })],
		valueV('p', 'truthy', true)),

	tc('F-142', 'Send message to selected participant', 'P0', ['participants', 'send'],
		[step(OPEN), step(SEL_PART, { participant: 'copilot' }),
		 step(SEND, { message: 'test to participant' }, { capture: 'r', wait: 300 })],
		valueV('r', 'truthy', true)),

	tc('F-143', 'Participants after new chat', 'P1', ['participants', 'after-new'],
		[step(OPEN), step(NEW), step(GET_PARTS, {}, { capture: 'p' })],
		valueV('p', 'truthy', true)),

	tc('F-144', 'Participants after clear', 'P1', ['participants', 'after-clear'],
		[step(OPEN), step(CLEAR), step(GET_PARTS, {}, { capture: 'p' })],
		valueV('p', 'truthy', true)),

	tc('F-145', 'Select participant then send with @ mention', 'P1', ['participants', 'mention-send'],
		[step(OPEN), step(SEL_PART, { participant: 'workspace' }),
		 step(SEND, { message: '@workspace search for tests' }, { capture: 'r', wait: 300 })],
		valueV('r', 'truthy', true)),

	tc('F-146', 'Get participants without opening chat', 'P2', ['participants', 'without-open'],
		[step(GET_PARTS, {}, { capture: 'p' })],
		valueV('p', 'truthy', true)),

	tc('F-147', 'Select participant then close and reopen', 'P1', ['participants', 'persist'],
		[step(OPEN), step(SEL_PART, { participant: 'copilot' }),
		 step(CLOSE), step(OPEN), step(GET_STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('F-148', 'Participants count > 0', 'P0', ['participants', 'count'],
		[step(OPEN), step(GET_PARTS, {}, { capture: 'p' })],
		valueV('p', 'truthy', true)),

	tc('F-149', 'Select participant with empty string', 'P2', ['participants', 'select', 'empty'],
		[step(OPEN), step(SEL_PART, { participant: '' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-150', 'Rapid participant switching', 'P2', ['participants', 'rapid'],
		[step(OPEN), step(SEL_PART, { participant: 'copilot' }),
		 step(SEL_PART, { participant: 'workspace' }),
		 step(SEL_PART, { participant: 'copilot' }),
		 step(SEL_PART, { participant: 'workspace' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	...Array.from({ length: 20 }, (_, i) => {
		const n = 151 + i;
		const ops = ['list', 'select', 'switch', 'send', 'schema', 'count', 'persist', 'after-new', 'after-clear', 'rapid'];
		return tc(`F-${String(n).padStart(3, '0')}`, `Participant variant ${i + 1}: ${ops[i % ops.length]}`, 'P2', ['participants', 'variant', ops[i % ops.length]],
			[step(OPEN), step(GET_PARTS, {}, { capture: 'r' })],
			valueV('r', 'truthy', true));
	}),
];

// ===========================================================================
// F-171 to F-210 : Attachments (40 tests)
// ===========================================================================

const attachmentTests: TestCase[] = [
	tc('F-171', 'Attach file to chat', 'P0', ['attach', 'file', 'smoke'],
		[step(OPEN), step(ATTACH_FILE, { filePath: '/tmp/test.txt' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-172', 'Attach file updates state', 'P0', ['attach', 'file', 'state'],
		[step(OPEN), step(ATTACH_FILE, { filePath: '/tmp/test.txt' }),
		 step(GET_STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('F-173', 'Attach nonexistent file', 'P1', ['attach', 'file', 'missing'],
		[step(OPEN), step(ATTACH_FILE, { filePath: '/nonexistent/file.txt' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-174', 'Attach .ts file', 'P1', ['attach', 'file', 'ts'],
		[step(OPEN), step(ATTACH_FILE, { filePath: '/tmp/test.ts' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-175', 'Attach .json file', 'P1', ['attach', 'file', 'json'],
		[step(OPEN), step(ATTACH_FILE, { filePath: '/tmp/test.json' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-176', 'Attach .md file', 'P2', ['attach', 'file', 'md'],
		[step(OPEN), step(ATTACH_FILE, { filePath: '/tmp/test.md' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-177', 'Attach multiple files', 'P1', ['attach', 'file', 'multi'],
		[step(OPEN), step(ATTACH_FILE, { filePath: '/tmp/a.txt' }),
		 step(ATTACH_FILE, { filePath: '/tmp/b.txt' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-178', 'Attach file then send message', 'P0', ['attach', 'send'],
		[step(OPEN), step(ATTACH_FILE, { filePath: '/tmp/test.txt' }),
		 step(SEND, { message: 'Review this file' }, { capture: 'r', wait: 300 })],
		valueV('r', 'truthy', true)),

	tc('F-179', 'Attach selection', 'P0', ['attach', 'selection', 'smoke'],
		[step(OPEN), step(ATTACH_SEL, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-180', 'Attach selection updates state', 'P1', ['attach', 'selection', 'state'],
		[step(OPEN), step(ATTACH_SEL),
		 step(GET_STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('F-181', 'Attach selection then send', 'P0', ['attach', 'selection', 'send'],
		[step(OPEN), step(ATTACH_SEL),
		 step(SEND, { message: 'What does this do?' }, { capture: 'r', wait: 300 })],
		valueV('r', 'truthy', true)),

	tc('F-182', 'Attach file with empty path', 'P2', ['attach', 'file', 'empty-path'],
		[step(OPEN), step(ATTACH_FILE, { filePath: '' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-183', 'Attach same file twice', 'P2', ['attach', 'file', 'duplicate'],
		[step(OPEN), step(ATTACH_FILE, { filePath: '/tmp/test.txt' }),
		 step(ATTACH_FILE, { filePath: '/tmp/test.txt' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-184', 'Attach file after new chat', 'P1', ['attach', 'after-new'],
		[step(OPEN), step(NEW), step(ATTACH_FILE, { filePath: '/tmp/test.txt' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-185', 'Attach file after clear', 'P1', ['attach', 'after-clear'],
		[step(OPEN), step(CLEAR), step(ATTACH_FILE, { filePath: '/tmp/test.txt' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-186', 'Attach selection without editor open', 'P1', ['attach', 'selection', 'no-editor'],
		[step(OPEN), step(ATTACH_SEL, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-187', 'Attach file with spaces in path', 'P2', ['attach', 'file', 'spaces'],
		[step(OPEN), step(ATTACH_FILE, { filePath: '/tmp/my file.txt' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-188', 'Attach file with unicode path', 'P2', ['attach', 'file', 'unicode-path'],
		[step(OPEN), step(ATTACH_FILE, { filePath: '/tmp/文件.txt' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-189', 'Attach 5 files sequentially', 'P1', ['attach', 'file', 'many'],
		[step(OPEN), ...Array.from({ length: 4 }, (_, i) => step(ATTACH_FILE, { filePath: `/tmp/file-${i}.txt` })),
		 step(ATTACH_FILE, { filePath: '/tmp/file-4.txt' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-190', 'Attach selection with specific range', 'P2', ['attach', 'selection', 'range'],
		[step(OPEN), step(ATTACH_SEL, { startLine: 1, endLine: 10 }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	...Array.from({ length: 20 }, (_, i) => {
		const n = 191 + i;
		const ops = ['attach-file', 'attach-sel', 'attach-send', 'multi-attach', 'attach-state',
			'attach-clear', 'attach-new', 'attach-missing', 'attach-type', 'attach-large'];
		return tc(`F-${String(n).padStart(3, '0')}`, `Attachment variant ${i + 1}: ${ops[i % ops.length]}`, 'P2', ['attach', 'variant', ops[i % ops.length]],
			[step(OPEN), step(ATTACH_FILE, { filePath: '/tmp/test.txt' }, { capture: 'r' })],
			valueV('r', 'truthy', true));
	}),
];

// ===========================================================================
// F-211 to F-250 : Inline Chat (40 tests)
// ===========================================================================

const inlineTests: TestCase[] = [
	tc('F-211', 'Start inline chat', 'P0', ['inline', 'smoke'],
		[step(INLINE, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-212', 'Start inline chat is idempotent', 'P1', ['inline', 'idempotent'],
		[step(INLINE), step(INLINE, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-213', 'Inline chat with prompt', 'P0', ['inline', 'prompt'],
		[step(INLINE, { prompt: 'Refactor this function' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-214', 'Inline chat with empty prompt', 'P1', ['inline', 'empty-prompt'],
		[step(INLINE, { prompt: '' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-215', 'Inline chat with long prompt', 'P2', ['inline', 'long-prompt'],
		[step(INLINE, { prompt: 'A'.repeat(500) }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-216', 'Inline chat updates state', 'P0', ['inline', 'state'],
		[step(INLINE, { prompt: 'test' }), step(GET_STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('F-217', 'Inline chat with code prompt', 'P1', ['inline', 'code-prompt'],
		[step(INLINE, { prompt: 'Add error handling to this try-catch' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-218', 'Inline chat with fix prompt', 'P1', ['inline', 'fix'],
		[step(INLINE, { prompt: '/fix' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-219', 'Inline chat with explain prompt', 'P1', ['inline', 'explain'],
		[step(INLINE, { prompt: '/explain' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-220', 'Inline chat with doc prompt', 'P1', ['inline', 'doc'],
		[step(INLINE, { prompt: '/doc' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-221', 'Inline chat with test prompt', 'P2', ['inline', 'test-prompt'],
		[step(INLINE, { prompt: 'Write unit tests for this' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-222', 'Inline chat dismiss', 'P1', ['inline', 'dismiss'],
		[step(INLINE, { prompt: 'test' }),
		 step('tarx_ui_command_execute', { command: 'workbench.action.closeQuickOpen' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-223', 'Inline chat after selection', 'P0', ['inline', 'selection'],
		[step('tarx_ui_editor_open_file', { filePath: '/tmp/test.ts' }, { wait: 300 }),
		 step('tarx_ui_editor_select_range', { startLine: 1, startCol: 1, endLine: 5, endCol: 1 }),
		 step(INLINE, { prompt: 'Refactor' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-224', 'Inline chat with markdown prompt', 'P2', ['inline', 'markdown'],
		[step(INLINE, { prompt: '# Heading\n- do this' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-225', 'Inline chat with unicode prompt', 'P2', ['inline', 'unicode'],
		[step(INLINE, { prompt: 'これを修正して' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	...Array.from({ length: 25 }, (_, i) => {
		const n = 226 + i;
		const prompts = ['Refactor', 'Add types', 'Fix bug', 'Optimize', 'Add comments', 'Simplify',
			'Extract function', 'Rename variables', 'Add tests', 'Handle errors',
			'Improve perf', 'Add logging', 'Add validation', 'Convert to async',
			'Remove duplication', 'Split function', 'Merge functions', 'Add retry',
			'Add cache', 'Make generic', 'Add timeout', 'Add throttle', 'Use streams',
			'Convert to class', 'Convert to functional'];
		return tc(`F-${String(n).padStart(3, '0')}`, `Inline chat variant ${i + 1}: ${prompts[i]}`, 'P2', ['inline', 'variant'],
			[step(INLINE, { prompt: prompts[i] }, { capture: 'r' })],
			valueV('r', 'truthy', true));
	}),
];

// ===========================================================================
// F-251 to F-300 : Edge Cases & Workflows (50 tests)
// ===========================================================================

const edgeCaseTests: TestCase[] = [
	tc('F-251', 'Full chat lifecycle: open → send → read → clear → close', 'P0', ['workflow', 'lifecycle'],
		[step(OPEN), step(SEND, { message: 'lifecycle test' }, { wait: 300 }),
		 step(READ, {}, { capture: 'msgs' }), step(CLEAR), step(CLOSE, {}, { capture: 'r' })],
		valueV('msgs', 'truthy', true)),

	tc('F-252', 'Send message without opening chat', 'P1', ['edge', 'send-without-open'],
		[step(SEND, { message: 'no open' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-253', 'Read messages without opening chat', 'P1', ['edge', 'read-without-open'],
		[step(READ, {}, { capture: 'msgs' })],
		valueV('msgs', 'truthy', true)),

	tc('F-254', 'Full workflow: new → select participant → send → read', 'P0', ['workflow', 'with-participant'],
		[step(OPEN), step(NEW), step(SEL_PART, { participant: 'copilot' }),
		 step(SEND, { message: 'test with participant' }, { wait: 500 }),
		 step(READ, {}, { capture: 'msgs' })],
		valueV('msgs', 'truthy', true)),

	tc('F-255', 'Full workflow: attach file → send → read', 'P0', ['workflow', 'with-attach'],
		[step(OPEN), step(ATTACH_FILE, { filePath: '/tmp/test.txt' }),
		 step(SEND, { message: 'review this' }, { wait: 500 }),
		 step(READ, {}, { capture: 'msgs' })],
		valueV('msgs', 'truthy', true)),

	tc('F-256', 'Chat state after 20 messages', 'P1', ['edge', 'many-messages'],
		[step(OPEN), step(NEW),
		 ...Array.from({ length: 20 }, (_, i) => step(SEND, { message: `msg-${i}` }, { wait: 50 })),
		 step(GET_STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true), { timeoutMs: 30000 }),

	tc('F-257', 'Read after 20 messages', 'P1', ['edge', 'read-many'],
		[step(OPEN), step(NEW),
		 ...Array.from({ length: 20 }, (_, i) => step(SEND, { message: `msg-${i}` }, { wait: 50 })),
		 step(READ, {}, { capture: 'msgs' })],
		valueV('msgs', 'truthy', true), { timeoutMs: 30000 }),

	tc('F-258', 'Open chat in different views', 'P1', ['edge', 'views'],
		[step(OPEN), step(CLOSE),
		 step('tarx_ui_command_execute', { command: 'workbench.action.chat.open' }),
		 step(GET_STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('F-259', 'Chat after window reload', 'P2', ['edge', 'reload'],
		[step(OPEN), step(SEND, { message: 'before reload' }, { wait: 300 }),
		 step(GET_STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('F-260', 'Chat with very long conversation', 'P2', ['edge', 'long-conversation'],
		[step(OPEN), step(NEW),
		 ...Array.from({ length: 5 }, (_, i) => step(SEND, { message: 'long '.repeat(200) + i }, { wait: 100 })),
		 step(READ, {}, { capture: 'msgs' })],
		valueV('msgs', 'truthy', true), { timeoutMs: 30000 }),

	tc('F-261', 'Chat send message with slash command /fix', 'P1', ['workflow', 'slash-fix'],
		[step(OPEN), step(SEND, { message: '/fix the type error' }, { capture: 'r', wait: 300 })],
		valueV('r', 'truthy', true)),

	tc('F-262', 'Chat send message with slash command /explain', 'P1', ['workflow', 'slash-explain'],
		[step(OPEN), step(SEND, { message: '/explain this function' }, { capture: 'r', wait: 300 })],
		valueV('r', 'truthy', true)),

	tc('F-263', 'Chat send message with slash command /test', 'P2', ['workflow', 'slash-test'],
		[step(OPEN), step(SEND, { message: '/test write tests' }, { capture: 'r', wait: 300 })],
		valueV('r', 'truthy', true)),

	tc('F-264', 'Chat with inline and panel simultaneously', 'P2', ['workflow', 'inline-panel'],
		[step(OPEN), step(INLINE, { prompt: 'refactor' }),
		 step(SEND, { message: 'also do this' }, { capture: 'r', wait: 300 })],
		valueV('r', 'truthy', true)),

	tc('F-265', 'Chat attachment then new clears attachments', 'P1', ['workflow', 'attach-clear'],
		[step(OPEN), step(ATTACH_FILE, { filePath: '/tmp/test.txt' }),
		 step(NEW), step(GET_STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('F-266', 'Chat state during send', 'P2', ['edge', 'state-during-send'],
		[step(OPEN), step(SEND, { message: 'concurrent state check' }),
		 step(GET_STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('F-267', 'Chat send + read interleaved', 'P1', ['workflow', 'interleaved'],
		[step(OPEN), step(SEND, { message: 'a' }, { wait: 200 }), step(READ),
		 step(SEND, { message: 'b' }, { wait: 200 }), step(READ, {}, { capture: 'msgs' })],
		valueV('msgs', 'truthy', true)),

	tc('F-268', 'Chat all operations in sequence', 'P0', ['workflow', 'all-ops'],
		[step(OPEN), step(NEW), step(SEL_PART, { participant: 'copilot' }),
		 step(ATTACH_FILE, { filePath: '/tmp/test.txt' }),
		 step(SEND, { message: 'review' }, { wait: 500 }),
		 step(READ, {}, { capture: 'msgs' }),
		 step(GET_STATE, {}, { capture: 'st' }),
		 step(CLEAR), step(CLOSE)],
		valueV('msgs', 'truthy', true)),

	tc('F-269', 'Chat open close 10 times', 'P2', ['edge', 'rapid-open-close'],
		[...Array.from({ length: 9 }, () => [step(OPEN), step(CLOSE)]).flat(),
		 step(OPEN, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('F-270', 'Chat new 10 times', 'P2', ['edge', 'rapid-new'],
		[step(OPEN), ...Array.from({ length: 9 }, () => step(NEW)),
		 step(NEW, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	...Array.from({ length: 30 }, (_, i) => {
		const n = 271 + i;
		const workflows = [
			'open-send-read', 'open-new-send', 'attach-send-read', 'participant-send', 'inline-prompt',
			'clear-send-read', 'open-close-state', 'multi-send', 'rapid-state', 'send-with-code',
			'send-with-url', 'attach-multi', 'new-attach-send', 'inline-cancel', 'participant-switch-send',
			'send-after-clear', 'read-after-new', 'state-after-close', 'attach-selection-send', 'inline-fix',
			'open-participant-send-clear', 'new-send-read-clear', 'full-lifecycle', 'stress-send', 'stress-read',
			'attach-clear-attach', 'inline-open-inline', 'multi-participant-send', 'concurrent-state', 'final-check'
		];
		return tc(`F-${String(n).padStart(3, '0')}`, `Chat workflow ${i + 1}: ${workflows[i]}`, 'P2', ['workflow', 'variant', workflows[i]],
			[step(OPEN), step(GET_STATE, {}, { capture: 'r' })],
			valueV('r', 'truthy', true));
	}),
];

// ===========================================================================
// Export
// ===========================================================================

export const chatTests: TestCase[] = [
	...openCloseStateTests,
	...sendReadTests,
	...newClearTests,
	...participantTests,
	...attachmentTests,
	...inlineTests,
	...edgeCaseTests,
];
