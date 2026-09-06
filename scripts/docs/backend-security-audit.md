# Backend Security Audit

> Generated automatically by `pnpm security:audit`.

**Generated:** 2026-09-06T09:04:17.737Z

**Status:** PASSED

## Summary

| Severity  | Count |
| --------- | ----: |
| CRITICAL  |     0 |
| HIGH      |     0 |
| MEDIUM    |     0 |
| LOW       |     1 |
| **TOTAL** | **1** |

## Findings

### LOW — Logging

- **File:** `apps/backend/src/auth/auth.service.ts`
- **Line:** 373
- **Finding:** console logging detected.
- **Recommendation:** Prefer NestJS Logger for backend logging.

## Audit Policy

- `CRITICAL` findings cause the audit to fail.
- `HIGH` findings cause the audit to fail.
- `MEDIUM` findings are reported but do not fail the audit.
- `LOW` findings are reported but do not fail the audit.

## Commands

```bash
pnpm security:audit
```
