# Practice seed data

Two import packs (same `{ problems: [...] }` schema, same endpoint):

- **`practice-problems.json`** — 6 starter problems (below).
- **`practice-problems-pack-2.json`** — 11 more across additional patterns:
  arrays-hashing, sliding-window, two-pointers, prefix-sum, bit-manipulation,
  heap, greedy, graphs (8 DSA) + SQL joins / aggregation / group-having (3 SQL).
  Import it the same way; slugs auto-dedupe so the two packs don't collide.
  **SQL note:** aggregate problems ask the solver to ALIAS columns (`AS total`)
  so the result columns match `expectedColumns`.

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
