# Task Verification Skill

## When to Use

This skill applies when:
- Completing any code change task
- The user asks to "fix", "implement", "add", "update", or "refactor" code
- Before declaring any task as "done" or "complete"

## Required Verification Steps

**NEVER declare a task complete without running the verification script.**

### Run the Verify Script

From the project root, run the full verification:

```bash
cd /Users/bobby/Documents/inkweld && bun run verify
```

This script runs all required checks:
1. **Typecheck** - `npm run typecheck` (frontend + backend TypeScript validation)
2. **Backend verify** - `bun run lint && bun test`
3. **Frontend verify** - `npm run lint && npm test && npm run e2e:ci`
4. **Docs verify** - `bun run build` (ensures docs build successfully)

### If You Need to Run Checks Individually

For targeted debugging when `bun run verify` fails:

```bash
# Typecheck both projects
npm run typecheck

# Backend only
cd backend && bun run lint && bun test

# Frontend only (lint + unit tests + e2e)
cd frontend && npm run lint && npm test && npm run e2e:ci

# Docs only
cd docs/site && bun run build
```

## Completion Criteria

A task is ONLY complete when `bun run verify` passes with:
```
✅ Verify completed in X seconds
```

This means:
- [ ] TypeScript compiles without errors (frontend + backend)
- [ ] All lint rules pass (frontend + backend)
- [ ] All unit tests pass (frontend + backend)
- [ ] All e2e tests pass
- [ ] Docs build successfully

## What To Do If Verification Fails

1. **Type errors**: Fix the TypeScript errors in the code.
2. **Lint failures**: Fix the code to satisfy the lint rule. NEVER disable lint rules without explicit user approval.
3. **Unit test failures**: Fix the failing tests or the code causing them to fail.
4. **E2E test failures**: Check Playwright trace files for debugging. Look at the error context file mentioned in output.
5. **Docs build failures**: Fix any broken links or build issues in docs/site.
6. **Flaky/unrelated failures**: If a test fails that is clearly unrelated to your changes (e.g., a timeout in a completely different area), note it to the user and suggest investigating separately.

## Critical Reminders

- **Always run from project root** - The verify script expects to be run from `/Users/bobby/Documents/inkweld`
- **Frontend uses `npm test`** - Bun's test runner is incompatible with Angular tests
- **Backend uses `bun test`** - It runs on Bun runtime
- **E2E tests are included** - The verify script runs `e2e:ci`, not just unit tests
- **Never skip verification** - Even for "simple" changes
- **Run verify after EVERY change** - Not just at the end of a session
