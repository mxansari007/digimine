# Virtual Lab — Demo, Install & Operations Runbook

The Virtual Lab is a live, supervised, gamified lab room that lives **inside a classroom**.
Only that class's enrolled students (+ its teacher) can join, and only if the teacher
enabled the lab for that class. This runbook covers: how to demo it locally, how to
install the desktop agent for remote control, the production deploy steps, the security
model, and the hardening checklist.

> Branch: `feat/virtual-lab`. Feature flag: `NEXT_PUBLIC_FEATURE_VIRTUAL_LAB=1`.

---

## 0. What's built

| Capability | Where | Notes |
|---|---|---|
| Per-class opt-in (`labEnabled`) | Create-class modal + class settings | Teacher decides at creation; editable later |
| Live room + participant map | `components/lab/` (web) | Avatars + live status (on-task / idle / needs-help / sharing) |
| Teacher broadcast (screen + cam → all) | LiveKit, role = roomAdmin | |
| Student → teacher "view my screen" | screen-share track + view stage | |
| Peer share (student ↔ student) + who→whom lines | `LabShareControls`, `LabMap` | Gated by `settings.allowPeerShare` |
| Spotlight a participant to the class | moderation API + data pulse | Durable on the session doc |
| Teacher moderation (force-end any share) | `POST /api/lab/sessions/[id]/moderate` | Server-authoritative mute + publish-revoke |
| Recording → Firebase Storage + replay | LiveKit Egress → GCS, Lab Library | `● REC` consent indicator for everyone |
| **Remote desktop control** | Electron agent (`apps/lab-agent`) | Hard consent gate; see §2 |
| Mobile companion (view / watch / raise hand / replay) | `apps/mobile` | View-only; needs a native dev build |
| Teacher lab analytics + student gamification | web | Computed from the audit log; see §4 |

---

## 1. Local web demo (the live room)

The realtime room is the part only a browser can show. ~5 minutes:

1. **Add LiveKit env** (already in `apps/web/.env.local`, gitignored):
   ```
   LIVEKIT_URL=wss://placementranker-2x27vi9k.livekit.cloud
   LIVEKIT_API_KEY=…
   LIVEKIT_API_SECRET=…            # server-only, never NEXT_PUBLIC
   NEXT_PUBLIC_LIVEKIT_URL=wss://placementranker-2x27vi9k.livekit.cloud
   NEXT_PUBLIC_FEATURE_VIRTUAL_LAB=1
   ```
2. **Restart the web dev server** so it loads `.env.local` (env is read at boot):
   ```
   cd ~/digimine/apps/web && pnpm dev
   ```
3. **Enable the lab on a class**: create a class with the *"Enable the Virtual Lab"*
   toggle ON (or flip it in an existing class's settings).
4. **Teacher tab** → open that class → Virtual Lab card → **Start Lab**. Allow screen +
   camera when prompted → you're broadcasting.
5. **Student tab** (a 2nd browser / incognito, signed in as an *enrolled student* of that
   class) → the class hub shows a **"Live lab"** banner → **Join**.
6. Things to try:
   - Teacher sees the student on the **map**; click a student → **View screen** (student
     shares to teacher) → **Request remote control** (only works if the student is on the
     desktop **agent** — see §2; a browser-only student can't be OS-controlled).
   - Student → **Share to a classmate** → the **who→whom line** appears on the map.
   - Teacher → **Spotlight** a participant → everyone's stage switches to them.
   - Teacher → **End share** on any student → their share is force-cut (server mute).
   - Teacher → **Record** → the `● REC` indicator shows for everyone → **Stop** → the
     recording appears in **Lab recordings** for replay.

> If "Start Lab" 403s: the class doesn't have `labEnabled`. If the room won't connect:
> the dev server didn't pick up `.env.local` (restart it), or the LiveKit creds are wrong.

---

## 2. Desktop agent — remote control (`apps/lab-agent`)

Remote control of a student's **actual desktop** requires the student to run the Electron
agent (a browser can't be OS-controlled). The agent captures the full desktop, publishes
it to the lab room, and injects the teacher's mouse/keyboard **only after the student
explicitly consents** — with an always-on, non-dismissable banner and instant revoke.

### Install / run (student machine)
```
cd ~/digimine/apps/lab-agent
npm install
# nut-js ships native N-API binaries for stock Node, not Electron's ABI — rebuild them:
npx @electron/rebuild -f -w @nut-tree-fork/nut-js
npm run build
npm start
```
Point the agent at your API with `LAB_AGENT_API_URL` (defaults to localhost in dev; set it
to `https://www.placementranker.com` against prod). The agent mints its LiveKit token via
`POST /api/lab/token` (Bearer) — **no LiveKit secret ever lives in the agent**.

### OS permissions the student must grant
- **macOS — Screen Recording** (System Settings → Privacy & Security → Screen Recording →
  enable *Lab Agent*): required to capture the screen at all (macOS 10.15+). After a denial
  macOS won't re-prompt — toggle it manually and **restart** the agent.
- **macOS — Accessibility** (Privacy & Security → Accessibility → enable *Lab Agent*):
  required for remote control (synthesizing mouse/keyboard). Also needs a **restart**.
- **Windows**: screen capture works with no prompt. To inject into elevated (admin)
  windows the agent must itself run **as administrator**; otherwise that input is silently
  dropped by the OS. (Linux/Wayland control is unsupported in v1 — sharing still works.)

### Consent flow (what the student sees)
1. Agent shares the desktop → amber banner *"your screen is being shared."*
2. Teacher requests control → a modal: *"<teacher> wants to control your screen — Allow /
   Deny."* **Nothing is armed by any inbound message** — only the student's **Allow** arms it.
3. Allow → banner turns red *"your teacher is CONTROLLING your screen"*; only that teacher
   (verified by LiveKit sender identity) can inject.
4. Revoke anytime — in-window Stop, the banner Stop, or the tray. Disconnect = implicit
   revoke. Injection is cut **before** any teardown.

---

## 3. Mobile companion (`apps/mobile`)

View-only companion: join the live lab, see the map, watch the teacher broadcast, raise
hand, and replay recordings. Three screens — `/lab/[sessionId]` (live room), `/lab/recordings`
(list), `/lab/replay/[recordingId]` (player) — plus a "Join live lab" CTA and a "Lab
recordings" tile on the class screen. Token + ws URL come only from `api.getLabToken()`
(no hard-coded creds); the room never publishes media (view-only).

It uses **native modules** — `@livekit/react-native ^2.11.1` + `@livekit/react-native-webrtc
^144.1.1` (already added to `apps/mobile/package.json`) — so it needs a dev build / prebuild,
**not Expo Go** (`registerGlobals()` is a guarded no-op until then, so the rest of the app
still runs):
```
cd ~/digimine/apps/mobile
npm install
npx expo prebuild --clean    # autolinks the native LiveKit/WebRTC modules
npx expo run:android         # on the Pixel_7 AVD
```
Typecheck is clean (`npx tsc --noEmit` → 0 errors); the live room can only be **run** after
the native rebuild.

---

## 4. Analytics & gamification

- **Teacher** — *"Lab insights"* (link on the class's Virtual Lab card →
  `/teacher/classes/[classId]/lab-insights`): KPI roll-up + a session selector + a
  per-student engagement table (time-in-lab, hands, shares, on-task %), computed from the
  `labEvents` audit log (**no extra writes**). Teacher-only (routes 403 a student).
- **Student** — a `LabStats` card in the class hub (`classroom/[classId]`): XP + level
  (progress bar), streak, earned/locked badges, and the class leaderboard. A student sees
  only their **own** detailed breakdown + a rank/name/xp/level board — never a peer's stats.
- XP rules: join +10, on-task +5/10min, hand +5, share-to-teacher +15, peer share +10,
  spotlight +20 (per-session caps to prevent farming). Levels L1–L5 at 0/50/200/450/800 XP.

---

## 5. Production deploy (your steps — ~5 min)

1. **Rotate the LiveKit API secret** (the dev one was pasted in chat) in the LiveKit Cloud
   dashboard, and update `LIVEKIT_API_SECRET` in Vercel env (Production).
2. Set the LiveKit Cloud **webhook** → `https://www.placementranker.com/api/lab/webhooks/livekit`
   (signature-verified server-side). Without it, recording stop falls back to a poll.
3. Set Vercel **env vars** (Production): `LIVEKIT_URL`, `LIVEKIT_API_KEY`,
   `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL`, `NEXT_PUBLIC_FEATURE_VIRTUAL_LAB=1`.
   Recording reuses the existing `FIREBASE_*` service-account env (no new secret) and writes
   to the real bucket `digimine-1c33f.firebasestorage.app`.
4. Deploy the rules + indexes:
   ```
   cd ~/digimine && pnpm deploy:rules && pnpm deploy:indexes
   ```

---

## 6. Security model (invariants — do not regress)

- **Membership-gated at two layers**: Firestore rules (class membership) **and** the
  `/api/lab/token` API. No membership → no LiveKit token → cannot enter.
- **Secrets never reach the client**: `LIVEKIT_API_SECRET` + `FIREBASE_*` are server-only.
  Clients get only short-lived LiveKit tokens; recording playback uses server-side signed URLs.
- **Recording + remote control require consent + always-on indicators**: `● REC` for
  everyone while recording; a non-dismissable "viewing/controlling" banner in the agent.
- **Remote-control injection** requires an active grant **bound to the verified LiveKit
  sender identity** — no inbound message can arm it; a third party can't inject mid-grant;
  revoke/disconnect cuts input synchronously.
- **Teacher-only actions** (moderation, analytics) check `resolveClassLabRole === 'teacher'`
  server-side; role is minted from the token, never client-trusted.
- The LiveKit **webhook verifies the signature** before trusting any payload.

---

## 7. Hardening (Phase 5)

**Done in code (verified):**
- **`allowPeerShare` is now server-authoritative** (was client-only). Four layers, all
  reading the policy from the session doc: (1) policy stamped into LiveKit **room metadata**
  at session create + re-stamped on a teacher toggle; (2) an explicit student
  `canPublishSources` grant seam; (3) the **events route 403s** a peer `share_start` when
  disabled (keeps the audit trail + XP honest); (4) **teacher moderation** force-end as the
  live kill switch. Residual: a fully-patched client could still let a peer subscribe at the
  SFU — the *server* guarantees are the trail refusal + force-end (documented).
- **Reconnection / connection-quality resilience** in `useLabRoom` — handles
  Reconnecting/Reconnected/Disconnected, restores broadcast/spotlight/connections, and
  re-mints the token on expiry.
- **Rate limits** on `/api/lab/token` (12/60s), `/events` (60/10s), `/recording` (10/60s),
  plus display-name + event-meta sanitization and a bounded analytics fold.
- **Adversarial security review** of the whole surface — passed (membership gating,
  teacher-only writes, `actorUid` from the verified token, server-only secrets, signed webhook).
- **NAAC/NBA evidence export** — *"Export report (CSV)"* on the teacher Lab insights view
  (`GET /api/lab/analytics/export?classId=…`, teacher-only): per-session + per-student
  participation for accreditation.

**Ops items for you (can't run headless):**
- [ ] **TURN / campus network**: test from a locked-down college network (UDP often
      blocked). LiveKit Cloud provides TURN/TLS-443 fallback — verify a firewalled student connects.
- [ ] **Load / scale**: a 1-teacher + 30–60-student room; watch SFU egress + client CPU.
- [ ] **External pen-test** of the token + moderation + agent surfaces before wide rollout.
