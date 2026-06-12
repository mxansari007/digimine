# Fullstack Project Evaluation — feature reference

Session-continuation doc. Built 2026-06-12. Read alongside `docs/PROJECT_GRAPH.md`
(the "graphify" map) for monorepo conventions. Status: **implemented end-to-end,
type-checks clean; blocked only on a valid DeepSeek API key for live scoring.**

## What it is

Teachers define a project assignment ("evaluation") with a brief + free-form
scoring parameters (e.g. "Authentication & security — 10 marks — passwords must
be hashed…"). Students submit a **public GitHub repo URL**. The server downloads
the repo tarball, picks the ~32 highest-signal source files, runs a 3-stage
LLM pipeline (DeepSeek via the existing `appConfig/aiProvider` config), and
produces a teacher-facing report: project summary, architecture, strengths /
improvements / red flags, and a per-parameter score with verdict
(met/partial/not_met), confidence, reasoning, and file-cited evidence.
**AI scores are reference points** — the teacher reviews, can override any
score, and adds a comment. **Scoring never auto-publishes**: a scored
submission is the teacher's private draft until they explicitly release it
to the student — per student (Publish/Withhold on the row or report) or in
bulk ("Publish N results" on the eval). Re-evaluating a submission withholds
it again. Until release the student sees an "Under review" state, not the
marksheet (the report payload is stripped server-side, not just hidden).

No CO-PO mapping (explicitly out of scope per user). Institute admins get a
read-only overview and can drill into any of their teachers' reports.

## Data model (server-only collections; explicit deny in firestore.rules)

- `projectEvaluations/{autoId}` — assignment. Fields per
  `packages/types/src/projectEvaluation.ts` (`ProjectEvaluation`). Key bits:
  `parameters[{id:'p1',title,description,maxScore}]`, `assignedMode:
  'classes'|'all_students'`, `classIds[]`, `status: draft|published|closed`,
  `dueAt`, denormalized `submissionCount`/`evaluatedCount`.
- `projectSubmissions/{evaluationId_studentId}` — one per student per eval
  (`ProjectSubmission`). `status: queued|processing|scored|failed`; resubmit
  overwrites results and bumps `attempt`. AI output in `repoMeta`, `overview`,
  `scores[]`, `totalScore`; teacher override in `teacherReview
  {adjustedScores, finalScore, comment}`. `resultPublished`/`resultPublishedAt`
  gate student visibility — set false on every (re)score, flipped true only by
  an explicit teacher publish; the student serializer strips the report while
  it's false.

## Processing model (no worker, no cron dependency)

1. Student POST `/api/project-evals/[evalId]/submit` → doc written `queued`.
2. Client **fire-and-forgets** POST `/api/project-eval/process {submissionId}`
   (`triggerProcessing` in `components/projectEval/shared.tsx`); that HTTP
   invocation runs the whole pipeline (`maxDuration = 300`). Client polls
   `my-submission` every 8s.
3. Claim is transactional (`queued → processing`) so double-triggers are no-ops.
4. Recovery: `reapStuckSubmissions` (processing >20min → re-queue, ≥2 retries →
   failed) runs opportunistically on every teacher submissions-list GET; teacher
   UI has Retry/Re-evaluate buttons; `/api/cron/project-eval/reap` exists but is
   **NOT in vercel.json** (Hobby plan already uses its 2-cron budget — register
   it when on Pro, or curl it with `Authorization: Bearer $CRON_SECRET`).
   Azure VM (the one running Piston) is the documented scale-out path: a tiny
   poller hitting the reap endpoint every minute, or a full worker — not built.

## Pipeline (apps/web/src/lib/server/projectEval/)

- `github.ts` — `parseGitHubUrl` (SSRF-safe owner/repo/tree-ref), tarball from
  `codeload.github.com` (1 unauthenticated request; 30MB download / 120MB
  extracted caps), **hand-rolled USTAR tar parser** (handles GNU longname 'L' +
  prefix field), best-effort commit count/date via GitHub REST (`GITHUB_TOKEN`
  env optional).
- `select.ts` — filters vendored/binary/lockfiles, tier-1 manifests always in
  (package.json, README, Dockerfile, schema.prisma, configs, entry points),
  then keyword-scored code (api/auth/models/etc.). Caps: 32 files, 12K chars
  each, 230K total.
- `pipeline.ts` — Stage A overview (tree+manifests → stack), Stage B analysis
  (file contents in ≤2 chunks of ≤120K chars → file-cited observations tagged
  to parameter ids), Stage C scoring (brief + params + observations → JSON
  scores). Scores clamped server-side to maxScore; missing params default to
  0/low-confidence rather than disappearing. Reuses `callChat` +
  `safeParseJsonObject` from `lib/server/aiInterview.ts` and
  `getAiProviderConfig` from `lib/server/aiProvider.ts`.
  `resolveEvalProvider()` falls back to `DEEPSEEK_API_KEY` env when the
  Firestore config has no key.
- `process.ts` — claim → fetch → select → pipeline → write scored/failed,
  bump eval counters.
- `store.ts` — collection consts, serializers, `canManageEvaluation` (owner
  teacher OR institute admin of eval.instituteId), `studentCanAccessEvaluation`
  (class intersection or all_students+enrolled-with-teacher),
  `getStudentTeacherIds`, `reapStuckSubmissions`, `sanitizeParameters`.

## API routes (all follow Bearer-token + admin SDK pattern)

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/teacher/project-evals` | GET/POST | `requireTeacher` | list / create (validates class ownership) |
| `/api/teacher/project-evals/[evalId]` | GET/PATCH/DELETE | `canManageEvaluation` | detail / edit+status / delete (no submissions only) |
| `…/[evalId]/submissions` | GET | same | list + opportunistic reap |
| `…/[evalId]/publish` | POST | same | bulk release/withhold all scored results (`{publish, submissionIds?}`) |
| `…/submissions/[submissionId]` | GET/PATCH/POST | same | report / review override + per-student release (`{adjustedScores?, comment?, publish?}`) / re-evaluate (re-queue) |
| `/api/project-evals/assigned` | GET | bearer | student's evals + own submission each |
| `/api/project-evals/[evalId]` | GET | student access or manager | detail for student page |
| `/api/project-evals/[evalId]/submit` | POST | `requireVerifiedUser` | create/overwrite submission (due-date + published checks) |
| `/api/project-evals/[evalId]/my-submission` | GET | bearer | polling |
| `/api/project-eval/process` | POST | owner student / manager / `x-eval-secret: CRON_SECRET` | runs the pipeline (maxDuration 300) |
| `/api/cron/project-eval/reap` | GET | `Bearer CRON_SECRET` | recovery sweep + processes ≤2 orphaned queued |
| `/api/institute/[instituteId]/project-evals` | GET | `assertInstituteAdmin` | institute overview w/ teacher names |

Firestore gotcha encoded in `assigned/route.ts`: only ONE disjunctive clause
(`in`/`array-contains-any`) per query — status filtering happens in JS.

## UI

**Design language (2026-06-12 redesign): "the marksheet meets the code review."**
Scores are documents with proof. Conventions — keep new surfaces consistent:
- Signature element: the **rubric ledger** (`components/projectEval/RubricLedger.tsx`)
  — verdict spine (success/warning/danger left bar), parameter title in
  `font-display`, tabular score fraction + hairline `Meter`, reasoning as quiet
  body text, evidence as `font-mono` citations behind a left gutter border.
  Teacher report passes `renderScoreControl` for overrides; student views pass
  `adjustedScores` read-only.
- Presentation kit in `components/projectEval/shared.tsx`: `ScoreRing`
  (SVG, sm/lg), `ScoreFraction`, `Meter`, `Eyebrow` (small-caps label),
  `RepoLink` (mono + GitHub mark), `EmptyState` (repo→marksheet line art),
  `SubmissionStatusBadge` (quiet pulsing status dots, motion-reduce-safe),
  `EvalStatusBadge` (Draft dashed / Open / Closed).
- Lists are **ledger tables** (uppercase tracking-wider thead, hover rows,
  responsive hidden columns), not stacked cards. Stats live in a divided
  3-column header strip. Numbers always `tabular-nums`; repo paths/marks
  denominators in `font-mono`; page titles in `font-display` (Outfit).
- Teal = actions only; amber = needs-attention (e.g. unsubmitted row border);
  band colors (≥70 green / ≥40 amber / red) only on score meters/rings.
- Loading = pulse skeleton blocks, never spinner text.

- Teacher: `(teacher)/teacher/project-evals/` — list, `new/` (param builder w/
  3 sensible default params, class chips, publish/draft), `[evalId]/`
  (brief+params, submissions table, 12s auto-refresh while active,
  retry/re-evaluate, eval publish/close, per-row `ReleaseBadge` +
  Publish/Withhold, and a bulk "Publish N results" / "Withhold all" toolbar),
  `[evalId]/submissions/[submissionId]/` (full report + per-param override
  inputs + review comment + Save draft / Save & publish / Withhold). NB:
  publishing the **eval** (status → accepts submissions) is distinct from
  releasing a student's **result**.
- Student: `(dashboard)/dashboard/project-evals/` — assigned list (an
  unreleased result shows "Under review", not a score); `[evalId]/` —
  brief/params, repo submit + resubmit, 8s polling; once scored it polls at
  20s for release and shows an "Under review" panel until the teacher
  publishes, then the scored report with teacher feedback.
- Institute: `(institute)/institute/project-evals/` — overview; "Open" links
  into the teacher pages (the (teacher) layout admits institute admins, and
  the teacher APIs authorize them via `canManageEvaluation`).
- Classroom (added same session): hub card + count on `/classroom/[classId]`
  (page-data route returns `counts.projectEvals`; hidden for `legacy:` ids),
  list page `/classroom/[classId]/project-evals` backed by
  `/api/classes/[classId]/project-evals` (`assertClassEnrollment`;
  `listClassProjectEvals` = class-assigned ∪ teacher's all_students evals).
- Class progress: `buildClassProjectEvalStats` (roster-scoped per-eval
  submitted/scored/pending/avg%) added to
  `/api/teacher/classes/[classId]/analytics` response (`projectEvals`) and
  rendered as a "Project evaluations" section in the class analytics page.
- Student progress: `listStudentProjectResults` (teacher's evals × direct
  submission-doc reads) added to
  `/api/teacher/students/[studentId]/analytics` (`projectResults`) and
  rendered as a per-eval table (status/reviewed/score + Report link) in
  `/teacher/students/[studentId]`.
- Shared: `components/projectEval/shared.tsx` (row types, badges incl.
  `ReleaseBadge` (Released/Held), ScoreBar, `triggerProcessing`). Sidebar
  entries added to all three navs in `components/layout/sidebarNav.tsx`.

## Deploy checklist

1. **Set the DeepSeek key** — `appConfig/aiProvider.apiKey` currently holds a
   placeholder (live test returned 401 "…gsdg is invalid"). Either fix it in
   Admin → settings, or set `DEEPSEEK_API_KEY` in apps/web/.env.local +
   Vercel env.
2. `pnpm deploy:rules` and `pnpm deploy:indexes` (7 new composite indexes:
   3 on projectEvaluations, 4 on projectSubmissions; explicit-deny rules).
3. Optional: `GITHUB_TOKEN` env to lift the 60/h commit-metadata limit.
4. Optional (Pro plan): add `/api/cron/project-eval/reap` to vercel.json crons.

## Verified

- tsc clean for apps/web + packages/types (only pre-existing test-file errors).
- Live smoke test: tarball download (159KB), tar parse (67 files), selection
  (32 files, correct priority: Dockerfile/README/package.json/main.ts/
  schema.prisma/auth first), commit info (65 commits), URL validation —
  against gothinkster/node-express-realworld-example-app.
- Pipeline reached DeepSeek and failed ONLY on the invalid stored key.

## Not built / future ideas

- Commit-history forensics (night-before-deadline detection), AST plagiarism
  vs. known boilerplates, student viva recording — discussed as the academic
  anti-cheat sell, not implemented.
- GitLab/Bitbucket, private-repo OAuth, zip upload.
- Azure worker for >300s repos; deployed-URL smoke tests (hit the live app).
- Eval edit UI page for teacher (`PATCH` API exists; only status changes are
  wired in the detail page).
- Institute-authored evaluations (institutes currently view, not create).
