---
name: tarx-commit-message
description: "Generate conventional commit messages based on staged changes"
route: local
tools:
  - tarx_chat
tier: free
---

# tarx-commit-message

## When to Use
- User asks to "write a commit message"
- User says "generate commit message for these changes"
- User mentions "conventional commits" or "commit format"
- User asks "what should I commit this as?"

## Instructions
1. Analyze the git diff or changed files provided by user
2. Determine the commit type:
   - `feat`: New feature
   - `fix`: Bug fix
   - `refactor`: Code restructuring (no behavior change)
   - `docs`: Documentation only
   - `test`: Adding/updating tests
   - `chore`: Maintenance (deps, build, config)
   - `perf`: Performance improvement
   - `style`: Code style/formatting (no logic change)
3. Identify the scope: the component/module affected (e.g., `auth`, `api`, `ui`)
4. Write a concise subject line (50 chars max):
   - Format: `<type>(<scope>): <description>`
   - Start with lowercase
   - No period at end
   - Imperative mood ("add" not "added")
5. If changes are complex, add a body:
   - Explain WHY the change was made
   - Wrap at 72 characters
   - Leave blank line after subject
6. Add footer for breaking changes:
   - `BREAKING CHANGE: <description>`

## Examples
User: "I added a login button to the header"
→ `feat(ui): add login button to header`

User: "Fixed a bug where users couldn't log out"
→ `fix(auth): prevent logout failure when session expired`

User: "Updated README with new install steps"
→ `docs(readme): update installation instructions`

User: "Refactored database connection pool"
→ ```
refactor(db): migrate to connection pooling

Replaced single connection with pool for better concurrency.
Reduces latency under high load.
```

## Constraints
- Subject line MUST be ≤50 characters
- Use conventional commit format
- Focus on WHAT changed and WHY, not HOW
- Don't include file names in subject (use scope instead)
- Use imperative mood: "add" not "adds" or "added"
