# Practice seed data

Three import packs (same `{ problems: [...] }` schema, same endpoint):

- **`practice-problems.json`** — 6 starter problems (below).
- **`practice-problems-pack-2.json`** — 11 more across additional patterns:
  arrays-hashing, sliding-window, two-pointers, prefix-sum, bit-manipulation,
  heap, greedy, graphs (8 DSA) + SQL joins / aggregation / group-having (3 SQL).
- **`practice-problems-pack-3.json`** — 14 more covering the patterns the
  first two packs miss: linked-list, trees, dp-1d, dp-2d, backtracking,
  intervals, monotonic-stack, math, plus one hard (Trapping Rain Water).
  SQL side adds self-join, subquery, and window-function problems.

Import the packs the same way; slugs auto-dedupe so the three packs don't
collide. **SQL note:** aggregate / window problems ask the solver to ALIAS
columns (`AS total`, `AS running`, `AS second_salary`) so the result columns
match `expectedColumns`.

`practice-problems.json` seeds 6 problems exercising the whole Practice flow:

| Problem | Kind | Difficulty | Pattern | Access |
|---|---|---|---|---|
| Sum of an Array | dsa | easy | arrays-hashing | free |
| Reverse a String | dsa | easy | two-pointers | free |
| Valid Parentheses | dsa | easy | stack | login |
| Maximum Subarray Sum | dsa | medium | dp-1d | premium |
| Binary Search Index | dsa | medium | binary-search | free |
| High Earning Employees | sql | easy | sql-select-filter | free |

This gives coverage for: free / login / premium gating, featured flag,
Pattern-Lens distractors (`patternChoices`), hints, editorials, hidden vs
sample test cases, DSA judging (Piston, stdin→stdout) and SQL judging
(in-app sql.js, `expectedColumns`/`expectedRows`).

## How the judge reads it
- **DSA**: each `testCase.input` is piped to **stdin**; program **stdout** is
  compared to `expectedOutput` after `normalizeOutput` (trailing whitespace and
  trailing newlines ignored). Starters already read stdin.
- **SQL**: the user's query runs against `sql.schemaSql`; the result set is
  compared to `expectedColumns` + `expectedRows`. `orderMatters: true` means
  row order is checked (we used `ORDER BY`).

## Import (admin only)

The endpoint `POST /api/admin/practice/problems` accepts `{ problems: [...] }`
and requires an admin Firebase ID token.

```bash
# 1. Grab an ID token for an admin account (one of the BOOTSTRAP_ADMINS or a
#    user with role admin/super_admin). Easiest: log into the web app as admin,
#    open devtools console and run:  await firebase.auth().currentUser.getIdToken()
TOKEN="<paste-admin-id-token>"
BASE="http://localhost:3000"   # or your deployed URL

curl -sS -X POST "$BASE/api/admin/practice/problems" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data @seed/practice-problems.json | jq
```

Response: `{ created: [...], createdCount: 6, errors: [] }`.

Slugs are auto-deduped, so re-running creates `-2`, `-3`… variants rather than
overwriting. Delete the old docs in the `practiceProblems` collection if you
want a clean re-seed.

## Smoke test after import
1. `/practice/problems` — list shows all 6, filters by kind/pattern/difficulty.
2. Open **Sum of an Array** → solve panel, run sample cases (should pass),
   submit (hidden cases run). Confirms Piston wiring + `PISTON_URL`.
3. Open **High Earning Employees** → SQL editor, run the reference query,
   confirm it matches expected rows (in-app judge, no Piston needed).
4. **Maximum Subarray Sum** is `premium` — verify the membership gate triggers
   for a non-subscribed user.
5. After a correct submit, check **Pattern Lens** recognition prompt and that
   `/practice` dashboard / Revision Radar pick up the solved problem.

---

## Persona accounts for QA (`pnpm seed:emulators`)

Running the full emulator seed (`pnpm seed:emulators`) creates ~20 persona
accounts on top of the 5 base `studentN@test.com` accounts — each persona is
a canonical, pre-built example of one student-side state of the app. Log in
as the persona for the feature you want to QA; no manual click-through
required to reach the state.

All persona passwords: **`Test1234!`** (same as the rest of the seed).

| Email | Scenario | Use to test |
|---|---|---|
| `rookie@test.com` | rookie | Empty-state UI everywhere — dashboard, journal, revision, mastery. |
| `explorer@test.com` | explorer | 5 attempts, 2 solves. Partial-state filters & "attempted but not solved" rendering. |
| `active@test.com` | active | Healthy power user — 15 solved across 6 patterns, **current 7-day streak**, mature SM-2. Dashboard, heatmap, recommendations. |
| `streaker@test.com` | streaker | **30-day continuous solve streak.** Longest-streak badge, heatmap density. |
| `lapsed@test.com` | lapsed | **12 overdue revision items.** Revision Radar urgency, return-from-break nudges. |
| `struggler@test.com` | struggler | 40+ failed attempts, 6 eventual solves. Low-mastery analytics, mentor-rescue prompts. |
| `firsttry@test.com` | firsttry | 12 first-try solves → **mastered tier** on multiple patterns. Mastery UI elite states. |
| `sqlonly@test.com` | sqlonly | Only SQL problems solved. SQL pattern Mastery Map, kind=sql filters. |
| `polyglot@test.com` | polyglot | Same problems solved in python/js/cpp/java. Language breakdown in profile. |
| `paid-pro@test.com` | paid-pro | Active Pro subscription. Premium problems (`maximum-subarray-sum`, `number-of-islands`) **unlocked + solved**. |
| `trial-pro@test.com` | trial-pro | Pro trialing — 5 days left. Trial countdown CTA. |
| `expired-pro@test.com` | expired-pro | Pro expired 10 days ago. Upgrade nudge + locked-but-formerly-solved premium problems. |
| `promo@test.com` | promo | Pro via promo grant. `source: "promo"`, `promoCode: "LAUNCH-50"`. |
| `community@test.com` | community | Authored 4 discussions + 3 solutions with upvotes. Profile activity, community surfaces. |
| `rescue@test.com` | rescue | One **open**, one **answered**, one **resolved** mentor rescue. Teacher inbox + student-side rescue thread. |
| `course-active@test.com` | course-active | Enrolled in **DSA Foundations** course. Course content access, my-courses listing. |
| `multiclass@test.com` | multiclass | Enrolled in **both** Class A (teacher-owned) and Class B (institute-owned). Multi-class nav + assignments. |
| `quiz-resume@test.com` | quiz-resume | In-progress attempt on **Arrays Basics** quiz. "Resume quiz" flow + state restoration. |
| `test-resume@test.com` | test-resume | In-progress attempt on **DSA Mock — Set 1 · Section 1**. "Resume test" flow. |
| `test-failed@test.com` | test-failed | Completed Mock Set 1 at 36% (below the 40% passing). Result page failure UX. |

### Where the data lives
- **Problems & sheets** — `practiceProblems`, `practiceSheets`
- **Per-student state** — `practiceProgress/{userId}_{problemId}`,
  `practiceMastery/{userId}_{pattern}`, `practiceSubmissions/{auto}`
- **Community** — `practiceDiscussions`, `practiceSolutions`, `practiceVotes`
- **Mentor rescue** — `practiceRescueRequests`
- **Subscriptions** — `userSubscriptions/{userId}`
- **Attempts** — `quizAttempts`, `testAttempts`
- **Enrollment** — `courseEnrollments/{userId}_{courseId}`, `classes/{classId}/students/{userId}`

The generating code is in `scripts/seed-student-scenarios.ts` and runs as
the last step of `pnpm seed:emulators`. Idempotent — every doc id is
deterministic, so re-running cleanly overwrites prior persona state.

### Adding a new persona
1. Add an entry to `PERSONAS` in `scripts/seed-student-scenarios.ts`.
2. Add a `case` branch to the dispatcher in `seedStudentScenarios()`.
3. Write a `scenarioYour-name()` function — reuse the helpers
   `simulateSolve()`, `simulateFailedAttempt()`, `setSubscription()`,
   `bumpMastery()` so mastery/SM-2 stay consistent with what the live
   `recordSubmission()` would have written.
4. Append a row to the table above.
