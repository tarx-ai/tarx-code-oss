/**
 * Tests for TARX Intent Classifier
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { classifyIntent, getBestSkill } from '../intentClassifier.js';

describe('classifyIntent', () => {
	it('classifies code generation requests', () => {
		const cases = [
			'Write a function to sort an array',
			'Generate a React component for login',
			'Create a new API endpoint',
			'Implement the user registration flow',
			'Can you write a helper function?',
		];

		for (const msg of cases) {
			const results = classifyIntent(msg);
			assert.equal(results[0].intent, 'code-gen', `Failed for: "${msg}"`);
			assert.ok(results[0].confidence > 0, `Zero confidence for: "${msg}"`);
		}
	});

	it('classifies memory requests', () => {
		const cases = [
			'Remember this decision',
			"Don't forget we chose PostgreSQL",
			'What do you know about the auth system?',
			'Do you remember what we discussed?',
			'Note that we use ESM modules',
		];

		for (const msg of cases) {
			const results = classifyIntent(msg);
			assert.equal(results[0].intent, 'memory', `Failed for: "${msg}"`);
		}
	});

	it('classifies debug requests', () => {
		const cases = [
			'I got an error in the build',
			'Something broke after the last deploy',
			'Check the health of the system',
			"Why is the API failing?",
			'Getting an error when I click submit',
		];

		for (const msg of cases) {
			const results = classifyIntent(msg);
			assert.equal(results[0].intent, 'debug', `Failed for: "${msg}"`);
		}
	});

	it('classifies knowledge requests', () => {
		const cases = [
			'Search for authentication docs',
			'Find the API specification',
			'Upload this file to the knowledge base',
			'What does the spec say about rate limiting?',
			'Look up the deployment guide',
		];

		for (const msg of cases) {
			const results = classifyIntent(msg);
			assert.equal(results[0].intent, 'knowledge', `Failed for: "${msg}"`);
		}
	});

	it('classifies project management requests', () => {
		const cases = [
			'Show me my projects',
			'Create a new space for the frontend work',
			'What am I working on?',
			'List my sessions',
			'Project status overview',
		];

		for (const msg of cases) {
			const results = classifyIntent(msg);
			assert.equal(results[0].intent, 'projects', `Failed for: "${msg}"`);
		}
	});

	it('returns unknown for unclassifiable messages', () => {
		const results = classifyIntent('Hello there');
		assert.equal(results[0].intent, 'unknown');
	});

	it('returns ranked results with confidence scores', () => {
		const results = classifyIntent('Write a function to fix this bug');
		assert.ok(results.length >= 2, 'Should match multiple intents');
		assert.ok(results[0].confidence >= results[1].confidence, 'Should be sorted by confidence');
	});
});

describe('getBestSkill', () => {
	it('returns null for messages below threshold', () => {
		const result = getBestSkill('Hi', 0.5);
		assert.equal(result, null);
	});

	it('returns the best matching skill with name', () => {
		const result = getBestSkill('Write a React component');
		assert.ok(result !== null);
		assert.equal(result.skillName, 'tarx-code-gen');
		assert.equal(result.intent, 'code-gen');
	});

	it('respects custom threshold', () => {
		const lowThreshold = getBestSkill('code', 0.01);
		const highThreshold = getBestSkill('code', 0.99);
		assert.ok(lowThreshold !== null);
		assert.equal(highThreshold, null);
	});
});
