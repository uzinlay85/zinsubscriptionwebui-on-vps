# CLAUDE.md — Developer Guide & Handoff Summary

This guide outlines the commands, architecture, and recent handoff notes for AI agents working on this repository.

---

## 🛠️ Build & Development Commands

- **Run Dev Server**: `npm run dev`
- **Build Production Bundle**: `npm run build`
- **TypeScript Typecheck**: `npx tsc --noEmit`
- **Lint Code**: `npm run lint`

---

## 🏗️ Architectural Decisions & Guidelines

### 1. Database Security (Supabase RLS)
- **Status**: **Row Level Security (RLS) is ENABLED** on all tables (`clients`, `servers`, `client_keys`, `settings`).
- **Server Actions & API Routes**: **MUST** use the secure admin client `supabaseAdmin` imported from `@/lib/supabase-server` (uses the server-only `SUPABASE_SERVICE_ROLE_KEY` to safely bypass RLS).
- **Client Components**: Do **NOT** perform direct database operations using the default anonymous client `supabase` from `@/lib/supabase` as it will be blocked by RLS.

### 2. Subscription Endpoints & Reliability
- **Route**: `/api/sub/[token]/route.ts`
- **Resilience Guidelines**:
  - Always return HTTP `200 OK` for suspended or expired accounts, serving a dummy informative proxy node (e.g. `🚫 Account Suspended` or `❌ Subscription Expired`). Do **NOT** return 401 or 404 error codes, as this triggers VPN client apps to delete the user's subscription link.
  - Implement a `5s timeout` (`AbortSignal.timeout(5000)`) on all third-party fetches (like 3x-ui sub-links) to prevent a single offline panel from hanging the entire subscription compiler.

### 3. Cron Jobs & Scheduling
- **Authorization**: All endpoints under `/api/cron/*` must be protected by validating the `Authorization: Bearer <CRON_SECRET>` header.
- **Hosting**: Since Vercel Free plan doesn't support short interval crons, cron triggers are hosted on a Linux VPS crontab pointing curl commands to Vercel endpoints.

### 4. Code Quality & UX Style
- **DRY Principle**: Reuse `fetchOutlineMetrics` from `@/lib/outline` for fetching server bytes. Avoid duplicate raw fetch scripts.
- **Modals & Dialogs**: Avoid using native browser `alert()` or `confirm()` dialogs. Use React state-based inline confirmations and custom toast states (see `ClientList.tsx` for implementation pattern).

---

## 📅 Handoff Summary (June 2026 Session)

### Completed Tasks
1. **Supabase RLS Migration**: Migrated all Next.js Server Actions, Route Handlers, and Cron APIs to utilize the `supabaseAdmin` client. Safe to turn on RLS on Supabase.
2. **Cron Authentication**: Fully enforced `CRON_SECRET` on all `/api/cron/*` routes.
3. **UX Overhaul**: Upgraded `ClientList.tsx` to handle deletions via inline state confirmations instead of standard browser confirms.
4. **Vercel/VPS Cron Config**: Cleared `vercel.json` crons and redirected cron tasks to standard Linux `crontab` via curl.
5. **Code Consolidation**: Centralized `fetchOutlineMetrics` inside `@/lib/outline.ts` and deleted redundant copies.
6. **Config Type Fixes**: Solved pre-existing type errors in `next.config.ts`.
