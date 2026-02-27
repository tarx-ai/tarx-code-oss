# TARX Project Context

## DEPLOY GUARDRAILS

**HARD BLOCK — not a suggestion.**

TARX Vercel deploys go ONLY to the TARX team scope. NEVER deploy to `saase` or any scope tied to `jwantz@saas-e-solutions.com`.

Every Claude Code session must run `vercel whoami` before any `vercel` command and abort if wrong scope. This is a hard block, not a suggestion.

### Pre-deploy checklist (mandatory):

```bash
# 1. Verify scope — MUST match TARX team
vercel whoami
# If output shows "saase" or "saas-e-solutions" → STOP. Do not proceed.

# 2. Only then deploy
vercel --prod
```

### Blocked scopes:
- `saase`
- `jwantz@saas-e-solutions.com`
- Any scope that is not the TARX team scope

### If wrong scope detected:
1. Do NOT deploy
2. Notify user immediately
3. Run `vercel switch` to correct scope before retrying
