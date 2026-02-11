---
name: tarx-explain-code
description: "Explain what code does in plain language, suitable for beginners or documentation"
route: local
tools:
  - tarx_chat
  - tarx_search_knowledge
tier: free
---

# tarx-explain-code

## When to Use
- User asks "what does this code do?"
- User requests "explain this function/class/file"
- User mentions "I don't understand this code"
- User asks "how does X work?"
- User says "explain this to me like I'm 5"

## Instructions
1. Read the code snippet, function, or file provided
2. Identify the code's purpose at a high level
3. Break down the explanation into sections:
   - **Purpose**: What problem does this solve? (1-2 sentences)
   - **How it works**: Step-by-step walkthrough of the logic
   - **Inputs**: What parameters/data does it expect?
   - **Outputs**: What does it return or produce?
   - **Side effects**: Does it modify state, call APIs, write files?
4. Use plain language:
   - Avoid jargon unless necessary (then define it)
   - Use analogies for complex concepts
   - Explain WHY not just WHAT
5. If code is complex, use visual aids:
   - Bullet points for steps
   - Example inputs/outputs
   - Diagrams (ASCII art if needed)
6. Use `tarx_search_knowledge` to find related project docs if available

## Examples
User: "What does this regex do? `/^\d{3}-\d{2}-\d{4}$/`"
→ "This is a regular expression that matches Social Security Numbers in the format XXX-XX-XXXX. It ensures the string has exactly 3 digits, a dash, 2 digits, a dash, and 4 digits."

User: "Explain this function: `const memoize = (fn) => { const cache = new Map(); return (...args) => { const key = JSON.stringify(args); return cache.has(key) ? cache.get(key) : cache.set(key, fn(...args)).get(key); }; }`"
→ ```
**Purpose**: This is a memoization function that caches results of expensive function calls.

**How it works**:
1. Creates a Map to store previous results
2. Returns a new function that wraps the original
3. When called, it converts arguments to a string key
4. If result is in cache, return it immediately
5. Otherwise, call the original function and store result

**Inputs**: Any function
**Outputs**: A cached version of that function

**Example**:
const slow = (n) => { /* expensive calculation */ };
const fast = memoize(slow);
fast(5); // Runs calculation
fast(5); // Returns cached result (instant)
```

User: "What does this file do?" [shows database.ts]
→ Provide overview: "This file manages database connections using a connection pool pattern. It exports functions for querying, transactions, and connection management."

## Constraints
- Adjust complexity to user's level (assume beginner unless context suggests otherwise)
- Don't just restate the code in English — explain the INTENT
- Use examples to illustrate abstract concepts
- If code is buggy or unclear, mention that gently
- Keep explanations concise for simple code, detailed for complex code
