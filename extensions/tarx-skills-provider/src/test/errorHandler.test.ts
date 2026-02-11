/**
 * Error Handler Tests
 *
 * Verify that error classification works correctly
 * Note: This is a manual verification test, not automated
 */

/**
 * Standalone error classifier without VS Code dependencies
 */
interface TarxError {
	code: string;
	message: string;
}

function classifyErrorStandalone(error: unknown): TarxError {
	const msg = error instanceof Error ? error.message : String(error);

	if (msg.includes('ECONNREFUSED') && msg.includes('11435')) {
		return {
			code: 'INFERENCE_DOWN',
			message: 'TARX local AI is starting up. This usually takes ~11 seconds.'
		};
	}

	if (msg.includes('ECONNREFUSED') && msg.includes('11437')) {
		return {
			code: 'EMBEDDINGS_DOWN',
			message: 'Knowledge search unavailable (embedding server offline). Continuing without search.'
		};
	}

	if (msg.includes('timeout') || msg.includes('AbortError')) {
		return {
			code: 'INFERENCE_TIMEOUT',
			message: 'Local inference taking longer than expected. Complex query?'
		};
	}

	if (msg.includes('ECONNREFUSED') && msg.includes('11436')) {
		return {
			code: 'MESH_DOWN',
			message: 'Mesh network unavailable. Running in local-only mode.'
		};
	}

	if (msg.includes('HTTP 500') || msg.includes('HTTP 502') || msg.includes('HTTP 503')) {
		return {
			code: 'SERVER_ERROR',
			message: 'TARX server encountered an error. Please try again.'
		};
	}

	if (msg.includes('currently unavailable')) {
		return {
			code: 'MODEL_UNAVAILABLE',
			message: 'Selected model is offline. Please try a different model or check server status.'
		};
	}

	return {
		code: 'UNKNOWN',
		message: `Something went wrong: ${msg.substring(0, 100)}`
	};
}

// Test error classification
function testClassifyError() {
	console.log('Testing error classification...');

	const tests = [
		{
			error: new Error('fetch failed: ECONNREFUSED localhost:11435'),
			expectedCode: 'INFERENCE_DOWN',
			description: 'Inference server offline'
		},
		{
			error: new Error('fetch failed: ECONNREFUSED localhost:11437'),
			expectedCode: 'EMBEDDINGS_DOWN',
			description: 'Embeddings server offline'
		},
		{
			error: new Error('fetch failed: ECONNREFUSED localhost:11436'),
			expectedCode: 'MESH_DOWN',
			description: 'Mesh network offline'
		},
		{
			error: new Error('AbortError: The operation was aborted'),
			expectedCode: 'INFERENCE_TIMEOUT',
			description: 'Request timeout'
		},
		{
			error: new Error('HTTP 500 Internal Server Error'),
			expectedCode: 'SERVER_ERROR',
			description: 'Server error'
		},
		{
			error: new Error('TARX Local (Qwen 8.2B) is currently unavailable'),
			expectedCode: 'MODEL_UNAVAILABLE',
			description: 'Model unavailable'
		},
		{
			error: new Error('Something completely unexpected'),
			expectedCode: 'UNKNOWN',
			description: 'Unknown error'
		}
	];

	let passed = 0;
	let failed = 0;

	for (const test of tests) {
		const result = classifyErrorStandalone(test.error);
		if (result.code === test.expectedCode) {
			console.log(`✓ ${test.description}: ${result.message}`);
			passed++;
		} else {
			console.error(`✗ ${test.description}: Expected ${test.expectedCode}, got ${result.code}`);
			failed++;
		}
	}

	console.log(`\nResults: ${passed} passed, ${failed} failed`);
	return failed === 0;
}

// Run tests
console.log('=== TARX Error Handler Tests ===\n');
const allPassed = testClassifyError();
console.log(`\n${allPassed ? 'All tests passed!' : 'Some tests failed'}`);
