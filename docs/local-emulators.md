# Local Firebase emulators

Run the entire Firebase stack on your machine — no real cloud project hit,
no quota consumed, no risk of polluting production data. Includes a one-shot
**seed script** that creates real users + classes + quizzes + attempts so
the analytics, command-center, and onboarding pages all have something to
render immediately.

## Prerequisites

- Node 18+ and pnpm (already in this repo's tooling)
- Java 11+ (the Firestore emulator requires it). On macOS: `brew install --cask temurin`. Verify with `java -version`.
- Ports `4000`, `8080`, `9099`, `9199` free.

The Firebase CLI (`firebase-tools`) and `tsx` are installed as workspace dev deps, so no global install required.

## One-time setup

In `apps/web/.env.local`, add:

```env
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=1
FIRESTORE_EMULATOR_HOST=localhost:8080
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
FIREBASE_STORAGE_EMULATOR_HOST=localhost:9199
```

The first variable (`NEXT_PUBLIC_`) wires the **browser client** to the emulators. The other three wire the **Node server (API routes, Admin SDK)** to them. The Firebase Admin SDK auto-detects those env vars; no code change beyond setting them.

Comment them out (or unset) when you want to point at the real cloud project again.

## Run flow

Open **three terminals** at the repo root.

### Terminal 1 — Emulators

```bash
pnpm emulators
```

This boots Auth (9099), Firestore (8080), Storage (9199), and the Emulator UI (`http://localhost:4000`). Leave it running.

### Terminal 2 — Seed data

```bash
pnpm seed:emulators
```

Idempotent — re-run any time to reset state. Output ends with a credentials table:

```
Log in with any of these accounts (password is the same for all):
─────────────────────────────────────────────────────────────
  admin@test.com               super_admin      password: Test1234!
  teacher@test.com             teacher          password: Test1234!
  institute@test.com           institute_admin  password: Test1234!
  student1@test.com            customer         password: Test1234!
  student2@test.com            customer         password: Test1234!
  student3@test.com            customer         password: Test1234!
  student4@test.com            customer         password: Test1234!
  student5@test.com            customer         password: Test1234!
─────────────────────────────────────────────────────────────

  Class A invite code: DSA-DEMO  (5 students enrolled)
  Class B invite code: FE-DEMO   (3 students enrolled, institute-owned)
  Emulator UI: http://localhost:4000
```

### Terminal 3 — Next.js dev server

```bash
pnpm dev
```

Visit `http://localhost:3000` and log in with any account above.

## What gets seeded

| Account | Role | What they see |
|---|---|---|
| `admin@test.com` | super_admin | `/admin` console |
| `teacher@test.com` | teacher | Class **DSA Mastery — Demo Batch** with 5 students, 2 quizzes, ~9 attempts spread across students to create real risk variance |
| `institute@test.com` | institute_admin | Institute **Seed Institute of Frontend** with class **Frontend Foundations — Demo Cohort** (3 students, 1 quiz) |
| `student1@test.com` | customer | Top performer (avg ~90% across both quizzes) |
| `student2@test.com` | customer | Average performer (~60%) |
| `student3@test.com` | customer | Struggling, declining trend (45 → 30 → 22%) — should show as **high risk** on the teacher command center |
| `student4@test.com` | customer | Ghost (one attempt 4 weeks ago, then idle) — should show as **high risk** |
| `student5@test.com` | customer | Never attempted — should show in **Hasn't started** panel |

The mix is intentional: it gives the class command center, single-student deep-dive, comparison page, and risk algorithm enough variance to render correctly.

## Persisting emulator data across restarts

By default the emulators wipe state on every restart. To keep your data:

```bash
# Run with import + auto-export
pnpm emulators:import

# Or manually snapshot the current state
pnpm emulators:export
```

The snapshot lives in `firebase/.emulator-data/` (gitignored).

## Pointing back to the real project

Comment out (or remove) the four env vars in `.env.local`, hard-reload the browser (`Cmd-Shift-R`), and you're back on the real cloud project.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Error: Could not start Firestore Emulator, port taken` | `lsof -i :8080` to find what's holding it, kill it. |
| `Could not find Java` | Install JDK 11+ (`brew install --cask temurin` on macOS). |
| Browser still loads from real Firestore | You forgot the `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=1` env var. Restart `pnpm dev` after adding it (Next.js doesn't hot-reload `NEXT_PUBLIC_*` env vars). |
| Login fails with `auth/user-not-found` | Re-run `pnpm seed:emulators` — emulator state was wiped (no import flag). |
| `pnpm seed:emulators` errors with `ECONNREFUSED 127.0.0.1:8080` | Emulators aren't running yet. Start `pnpm emulators` in terminal 1 first. |
| App Check errors | The client init skips App Check when `USE_EMULATORS=1`. If you still see them, you have stale browser cache — hard reload. |

## What about phone OTP / reCAPTCHA?

Firebase Auth emulator skips reCAPTCHA entirely. The phone-OTP flow in
`usePhoneOtp` already has a dev-mode bypass that activates on
`localhost`, so OTP entry on the local emulators accepts any 6-digit code.
You never see a real SMS.
