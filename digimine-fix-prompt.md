# PlacementRanker — three-role audit & fix pass

You are working on a Next.js 14 + Firebase + pnpm monorepo at `/Users/maazansari/digimine`. You have full filesystem + shell access. Do NOT ask for confirmation on individual edits/commands — execute, verify, and report. Do ask the user ONLY if you hit a genuinely ambiguous product decision that would be expensive to undo.

## Stack snapshot
- **Monorepo**: `apps/web` (Next.js 14 App Router, port 3000), `apps/admin` (port 3001), `packages/ui` (shared @digimine/ui), `packages/types`, `packages/shared`, `packages/config`.
- **Backend**: Firebase Auth + Firestore + Storage + Functions. Admin SDK for server. Redis-cached read-through via `apps/web/src/lib/server/cache.ts` (`cachedJson`, `invalidateCache`).
- **Roles**: customer (student), teacher, institute_admin, admin, super_admin.
- **Payments**: Razorpay for subscriptions. Existing `isPremium` hook + `Paywall` component already shipped.
- **Local Firebase**: emulator suite on auth:9099, firestore:8080, storage:9199, UI:4000. Seed script at `scripts/seed-emulators.ts`. All seeded accounts use password `Test1234!`. Run with `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=1`.

## Process you MUST follow

1. **Branch + survey first.** Create a branch `fix/three-role-audit-<date>`. Spend the first ~15 minutes reading: `apps/web/src/app/(teacher)/**`, `apps/web/src/app/(institute)/**`, `apps/admin/src/app/(dashboard)/**`, recent git log, and `~/.claude/projects/-Users-maazansari-digimine/memory/MEMORY.md` for context. Build a TaskList of concrete problems before changing code.

2. **Boot the emulators + seed.** From the repo root: `pnpm firebase:emulators` (or whatever script exists; check `package.json`) and `pnpm seed:emu`. Confirm at http://localhost:4000 that you have the 8 seeded accounts (admin, teacher Anita, institute Rohan, vikram, priya, 5 students).

3. **Work in small batches.** For each fix: implement → `pnpm exec tsc --noEmit` on the affected package → `pnpm exec next lint` on touched files → manual smoke test against emulator → commit with a clear message. Each commit must leave the tree compiling. Never bypass hooks (no `--no-verify`).

4. **Test E2E against emulators after every batch.** Sign in as the relevant role (Test1234!), walk the touched flow, screenshot or describe what you saw. Use the Chrome MCP if available to drive the UI; otherwise verify with curl + Firestore reads.

5. **Surface progress.** After each major area is complete, write a one-paragraph summary to a running `AUDIT_NOTES.md` file at the repo root. Include: what was broken, what you changed, what you tested. This file is your trail of breadcrumbs.

6. **Stop and ask the user** only if: (a) a fix would require a destructive Firestore migration, (b) a fix changes pricing/subscription billing math, (c) a fix touches authentication/security primitives, (d) the right answer is genuinely a product decision (e.g. "should institutes share content across all sub-institutes?").

## Hard constraints — do not violate

- **No `rm -rf`** outside `.next/`, `dist/`, `node_modules/`. Never `rm` Firestore docs by hand; use the emulator UI.
- **No `git push --force`**, no pushes to `main`/`master`, no production deploys. Stay on the feature branch.
- **No `--no-verify`**, no `--no-gpg-sign`, no skipping pre-commit hooks. Fix the underlying issue.
- **No changes to** Firebase Auth config, App Check enforcement, Firestore rules `allow if true`, or any secret values in `.env*`.
- **No edits to `apps/web/src/app/api/auth/**`** without a documented reason — that path enforces the email verification gate and rate limits.
- **Do not delete or rewrite the static `megaNavData.ts`** — it's the fail-open fallback for the admin-controlled mega-nav.

---

# Scope 1 — Teacher portal

Read everything under `apps/web/src/app/(teacher)/` and `apps/web/src/components/teacher/`. Then fix everything below.

## Known surface areas
- `/teacher/dashboard` — landing
- `/teacher/classes` and `/teacher/classes/[classId]` — class command center, per-subject management
- `/teacher/students` — all students roster with risk scoring
- `/teacher/students/[studentId]` — single-student deep dive
- `/teacher/content` — quizzes/tests/contests/courses the teacher owns
- `/teacher/questions` — question bank
- `/teacher/earnings` — payouts

## What to audit / fix
1. **Bugs.** Click every route, every primary CTA, every secondary action. Note anything that throws, 500s, or shows "undefined". Common suspects: stale Firestore index queries, missing `classId` thread-through on attempt routes, race conditions when teacher data hasn't loaded.
2. **Feature gaps.** Check whether these exist and work:
   - Add/remove a student from a specific class (not just from the institute) — required by the user.
   - Reorder subjects within a class.
   - Send a class-wide announcement / note.
   - Bulk-assign content (quiz/test) to one or more classes.
   - Schedule content to publish at a future time (if not present, mark TODO, don't build now).
3. **UI gaps.** Look for: empty-state pages with zero copy/CTA, raw `0` counts that should say "No data yet", tables with no sort/filter on roster pages, inconsistent button styles between `(teacher)` and `(institute)` layouts. Reuse `@digimine/ui` components.
4. **Student insight depth.** Currently the class detail page has risk scoring + attention list + per-student rows. Add (only if not already present): weak-topic breakdown per student (which question categories they fail most often), 14-day activity sparkline, comparison-against-class-average on each metric, and an exportable CSV of the roster. Pull from existing `quizAttempts` + `testAttempts` collections — do NOT add new collections.
5. **Tutorials.** Every teacher page must have a `<HelpTutorial>` with a populated entry in `apps/web/src/components/help/tutorials.ts`. If a page is missing one, add it.

---

# Scope 2 — Institute portal

Read everything under `apps/web/src/app/(institute)/` and `apps/web/src/app/api/institute/`. Then fix everything below.

## Known surface areas
- `/institute/dashboard`
- `/institute/teachers` — bulk add + roster
- `/institute/students` — bulk add + auto-attach on signup
- `/institute/classes` — sections with subjects + per-subject teacher
- `/institute/question-bank`, `/institute/content`, `/institute/billing`, `/institute/settings`

## What to audit / fix
1. **The big gap the user called out: assigning students to a specific class.** Today students get auto-attached to the institute via `pending:{email}` → uid rebind. There's no UI/flow to put an attached student INTO a class. Build it:
   - On `/institute/classes/[classId]` (create the route if it doesn't exist), show the class roster with an "Add students" picker that searches `institutes/{id}/student_invites` where status=active and the student is not already in the class.
   - Write to `classes/{classId}/students/{uid}` with the same fields the existing teacher-side enrollment writes (`classId`, `teacherId`, `studentId`, `joinedAt`, `totalAttempts: 0`).
   - Update `users/{uid}.enrolledClassrooms: arrayUnion(teacherId)` so the student dashboard's classroom card lights up.
   - Allow removal from a class (different from removal from institute).
2. **Other bugs / logic gaps.** Check: institute admin's role permission to edit teacher-owned content (should be allowed — `assertInstituteAdmin` must cover this), subject-assignment race where multiple teachers can be assigned the same subject, broken invite codes after a class rename, what happens when an institute admin tries to delete a class with active students (should refuse with a useful error).
3. **UI gaps.** The screenshots in memory show the dashboard with raw zeros. Add empty-state CTAs that link to the right action (e.g. dashboard with no teachers → "Add your first teacher" button pointing to `/institute/teachers`). Make sure every roster page has search + filter + pagination (use the existing `DataTable` from `@digimine/ui`).
4. **Tutorials.** Same rule — every page needs a `<HelpTutorial>` entry.

---

# Scope 3 — Admin portal + subscription flow for every role

Read everything under `apps/admin/src/app/(dashboard)/` and `apps/web/src/app/api/admin/`. Then fix everything below.

## The big piece: subscription model per role

The current state (per the memory):
- Razorpay checkout + verify + webhook routes shipped.
- `isPremium` hook + `Paywall` component shipped for students.
- Pricing page at `/pricing`.
- Pending tasks #24-27 (gate tests / quizzes / articles / courses).
- Pending task #29 (account/billing page + premium badge).
- Teachers pay ₹1 pre-auth on onboarding.
- Institutes have a seat-cap based billing.

What the user wants: **admin controls the subscription model for ALL THREE roles** (student, teacher, institute) with proper UI and a clean flow.

Build:

1. **Admin → Subscription plans editor.** `apps/admin/src/app/(dashboard)/subscription/page.tsx` already exists — extend or rebuild it so an admin can:
   - List all plans across all three role categories.
   - Create/edit a plan: name, role-scope (student/teacher/institute), price, billing cycle (monthly/yearly/lifetime), seat-cap (institute only), included features (free-form list of feature flags), public visibility (draft/published), tier ordering.
   - Mark one plan per role as the "default free tier" so unauthenticated visitors see the right CTA on `/pricing`.
   - Persist to a Firestore collection `subscription_plans` (keyed by plan id). Reads through Redis cache.
2. **Per-role pricing page.** `/pricing` currently exists for students. Add `/pricing/teacher` and `/pricing/institute` pages that read from `subscription_plans` filtered by scope. Reuse the existing pricing card component. If a role has no published plans, render a tasteful "Coming soon" empty state.
3. **Account/billing page** (`/dashboard/billing` for students, `/teacher/billing`, `/institute/billing` already exists). Each shows: current plan, next renewal date, payment method (last 4), invoice history, "Change plan" / "Cancel" buttons. Reuse `webhook` data already persisted.
4. **Premium badge in user menu.** When `isPremium === true`, show a small "Pro" / "Premium" chip next to the avatar in the header (`apps/web/src/components/layout/UserMenu.tsx`).
5. **Wire pending access gates** (tasks #24, #25, #26, #27):
   - Tests / test series — gate by `series.accessType` (free / pro / lifetime).
   - Quizzes — gate by `quiz.accessType`.
   - Articles — add a new `accessType` field (default "free", admin-toggleable).
   - Courses — gate by `course.accessType`.
   - Use the existing `<Paywall>` component for the locked UI.

## Admin UI polish
- All admin tables: search + filter + pagination consistent across pages.
- All admin create/edit forms: validate before submit, show field-level errors, disable submit while saving.
- Admin sidebar: group related pages (Content: Articles/Courses/Tests/Quizzes/Contests; Commerce: Products/Orders/Subscription/Payouts; People: Users/Teachers/Teacher Submissions; System: Mega-nav/Settings).
- Make sure every admin page is callable when running the admin app on localhost:3001 → web API on localhost:3000 (admin's `.env.local` already sets `NEXT_PUBLIC_WEB_API_URL=http://localhost:3000` and `authedFetch` handles cross-origin).

## Other admin bugs / logic gaps
- Walk every admin page and click every CTA. Note 500s, broken links, missing CORS preflights, missing admin auth guards.
- Verify that `requireAdmin` is on EVERY route under `/api/admin/*`. Any route missing it is a security bug — fix immediately.

---

# Testing protocol

For each batch of fixes:

1. **Type-check the affected package(s)**: `pnpm -F web exec tsc --noEmit`, `pnpm -F admin exec tsc --noEmit`, `pnpm -F @digimine/ui exec tsc --noEmit` (whichever applies).
2. **Lint the touched files**: `pnpm exec next lint --quiet --file <path>` (use the `--file` flag per file).
3. **Smoke-test in the emulator** as the affected role. Use the seed accounts (Test1234!). Walk the happy path and at least one error path.
4. **Commit** with a message like `fix(teacher): wire classId through quiz-attempt access check` (Conventional Commits style — the repo uses it).

When all three scopes are done:
- Write a final summary in `AUDIT_NOTES.md` with sections per scope: what was broken, what you fixed, what you intentionally deferred and why.
- Print the full list of commits on the branch.
- Do NOT open a PR. Stop and tell the user the branch is ready for review.

# Definition of done

- All three scopes audited and reported on in `AUDIT_NOTES.md`.
- Every fix has a passing typecheck + lint.
- Manual smoke test passes for the touched flows in the emulator.
- No regressions to the existing student/teacher/institute happy paths (sign-in, dashboard load, content browse, single content attempt).
- Branch `fix/three-role-audit-<date>` exists with clean commit history.
- Final summary message to the user lists: # commits, # files touched, # bugs fixed, # features added, # things deferred.

Begin.