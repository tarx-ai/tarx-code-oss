---
name: tarx-code-review
description: "Review code for bugs, style issues, security vulnerabilities, and best practices"
route: local
tools:
  - tarx_chat
  - tarx_search_knowledge
tier: free
---

# tarx-code-review

## When to Use
- User asks to "review this code" or "check this file"
- User requests code quality assessment
- User mentions "code review", "security audit", "best practices"
- User asks "what's wrong with this code?"

## Instructions
1. Read the code file or snippet provided by the user
2. Analyze the code for:
   - **Bugs**: Logic errors, edge cases, potential runtime errors
   - **Security**: SQL injection, XSS, command injection, insecure dependencies
   - **Style**: Naming conventions, code organization, readability
   - **Performance**: Inefficient algorithms, memory leaks, unnecessary operations
   - **Best Practices**: Framework-specific patterns, language idioms
3. Use `tarx_search_knowledge` to check if project has style guides or security policies
4. Present findings in order of severity: Critical → High → Medium → Low
5. For each issue:
   - Show the problematic code with line numbers
   - Explain why it's an issue
   - Suggest a fix with code example
6. End with a summary: "X issues found (Y critical, Z high)"

## Examples
User: "Review this authentication function"
→ Read file, check for:
  - Password handling (hashing, salting)
  - Session management
  - Input validation
  - Error messages (don't leak info)

User: "Is this code secure?"
→ Focus on OWASP Top 10:
  - Injection flaws
  - Broken authentication
  - Sensitive data exposure
  - XXE, CSRF, etc.

## Constraints
- Always provide specific line numbers for issues
- Don't be overly pedantic about style unless it affects readability
- Prioritize security and correctness over style
- If code is good, say so — don't invent issues
