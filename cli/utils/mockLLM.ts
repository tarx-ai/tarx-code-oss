/*---------------------------------------------------------------------------------------------
 *  Mock LLM Client for offline testing
 *  Simulates llama-server responses for testing TARX features
 *--------------------------------------------------------------------------------------------*/

export interface LLMResponse {
	content: string;
	finishReason: 'stop' | 'length';
	tokensUsed: number;
}

interface ChatMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
}

export class MockLLM {
	private latencyMs: number;

	constructor(options?: { latencyMs?: number }) {
		this.latencyMs = options?.latencyMs ?? 100;
	}

	async isOnline(): Promise<boolean> {
		return true; // Mock is always "online"
	}

	async chat(messages: ChatMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<string> {
		// Simulate network latency
		await this.delay(this.latencyMs);

		// Get the last user message
		const userMessage = this.getLastUserMessage(messages);
		if (!userMessage) {
			return 'No user message provided.';
		}

		// Generate contextual mock response
		return this.generateResponse(userMessage, messages);
	}

	private getLastUserMessage(messages: ChatMessage[]): string | null {
		for (let i = messages.length - 1; i >= 0; i--) {
			if (messages[i].role === 'user') {
				return messages[i].content;
			}
		}
		return null;
	}

	private generateResponse(userMessage: string, allMessages: ChatMessage[]): string {
		const lower = userMessage.toLowerCase();

		// Check for code in message
		const hasCode = userMessage.includes('```') || userMessage.includes('function') || userMessage.includes('const ');

		// Count history turns
		const historyTurns = allMessages.filter(m => m.role !== 'system').length;

		// Generate response based on intent
		if (lower.includes('explain')) {
			return this.explainResponse(userMessage);
		}

		if (lower.includes('refactor')) {
			return this.refactorResponse(userMessage);
		}

		if (lower.includes('fix') || lower.includes('bug')) {
			return this.fixResponse(userMessage);
		}

		if (lower.includes('test')) {
			return this.testResponse(userMessage);
		}

		if (lower.includes('error handling')) {
			return this.errorHandlingResponse(userMessage, historyTurns);
		}

		if (lower.includes('variable') || lower.includes('javascript')) {
			return this.conceptResponse(userMessage);
		}

		// Check if this seems to reference previous context
		if (lower.includes('previous') || lower.includes('earlier') || lower.includes('you said') || lower.includes('we discussed')) {
			return this.contextAwareResponse(allMessages);
		}

		// Default response
		if (hasCode) {
			return this.codeReviewResponse(userMessage);
		}

		return this.genericResponse(userMessage);
	}

	private explainResponse(message: string): string {
		return `This code defines a function that processes input data.

The main logic:
1. Takes input parameters
2. Validates the input
3. Processes and returns the result

The design uses early returns for validation, which keeps the happy path clear.`;
	}

	private refactorResponse(message: string): string {
		return `Here's the refactored version:

\`\`\`typescript
function processData(input: Input): Result {
  validate(input);
  return transform(input);
}
\`\`\`

Changes made:
- Extracted validation to separate function
- Simplified the transform logic
- Added proper typing`;
	}

	private fixResponse(message: string): string {
		return `Found the bug. The issue is an off-by-one error in the loop.

\`\`\`typescript
// Before (buggy)
for (let i = 0; i <= arr.length; i++)

// After (fixed)
for (let i = 0; i < arr.length; i++)
\`\`\`

The \`<=\` should be \`<\` to avoid accessing an undefined index.`;
	}

	private testResponse(message: string): string {
		return `\`\`\`typescript
describe('processData', () => {
  it('should handle valid input', () => {
    const result = processData({ value: 42 });
    expect(result).toBeDefined();
  });

  it('should throw on invalid input', () => {
    expect(() => processData(null)).toThrow();
  });

  it('should handle edge cases', () => {
    const result = processData({ value: 0 });
    expect(result.value).toBe(0);
  });
});
\`\`\``;
	}

	private errorHandlingResponse(message: string, historyTurns: number): string {
		let response = `I'll add error handling to this code.

\`\`\`typescript
async function fetchData(url: string): Promise<Data> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Network error: check your connection');
    }
    throw error;
  }
}
\`\`\`

Key additions:
- try/catch around the fetch
- HTTP status validation
- Network error detection
- Error re-throwing with context`;

		// Reference history if we have context
		if (historyTurns > 2) {
			response += `\n\nBuilding on our previous discussion, this follows the error handling pattern we established.`;
		}

		return response;
	}

	private conceptResponse(message: string): string {
		if (message.toLowerCase().includes('variable')) {
			return `A variable in JavaScript is a named container for storing data values.

\`\`\`javascript
const name = "Alice";  // constant - can't reassign
let count = 0;         // mutable - can reassign
\`\`\`

Use \`const\` by default, \`let\` when you need to reassign. Avoid \`var\`.`;
		}

		return `JavaScript is a dynamic, interpreted programming language primarily used for web development.

Key features:
- First-class functions
- Prototype-based inheritance
- Event-driven, non-blocking I/O
- Runs in browsers and Node.js`;
	}

	private contextAwareResponse(messages: ChatMessage[]): string {
		// Find the most recent assistant message to reference
		const assistantMessages = messages.filter(m => m.role === 'assistant');
		if (assistantMessages.length > 0) {
			const lastAssistant = assistantMessages[assistantMessages.length - 1];
			const snippet = lastAssistant.content.substring(0, 50);
			return `Yes, building on what I said earlier about "${snippet}..."

The next step would be to integrate this with the rest of your codebase. Want me to show how?`;
		}

		return `Based on our conversation so far, here's what I recommend next.`;
	}

	private codeReviewResponse(message: string): string {
		return `Looking at this code, a few observations:

1. The logic is clear and well-structured
2. Variable names are descriptive
3. Consider adding input validation

Want me to elaborate on any of these points?`;
	}

	private genericResponse(message: string): string {
		return `Got it. To help you better, could you share:

1. What you're trying to achieve
2. Any code or context involved
3. What you've already tried

This will help me give you a more targeted answer.`;
	}

	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}
