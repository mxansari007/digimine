# Virtual Lab — architecture RFC

Status: **CONTRACT / design**. This is the single source of truth other agents
build against. Types live in `packages/types/src/lab.ts` (exported from
`@digimine/types`). Read alongside `docs/PROJECT_EVAL_FEATURE.md` for the
server-only-collection + Bearer-token conventions this feature reuses.

## What it is

A **Virtual Lab** is a gamified live lab session that runs inside a class. A
teacher opens a session; their students join; everyone appears on a **live map**
of seat-gridded avatars, each badged with an activity status (on-task / idle /
needs-help / sharing / watching). On top of the map we layer low-latency media:

- **Teacher live broadcast** — the teacher's cam/screen to the whole room (1→N).
- **Student → teacher share** — a learner shows their screen to the teacher.
- **Student ↔ student peer share** — pair-programming / "look at mine" (gated by
  `settings.allowPeerShare`).
- **Recording for replay** — optional capture of the whole session, with
  event-derived chapter markers.
- **Remote control** (desktop only) — the teacher can drive a consenting
  student's machine via the installable agent.

It is **web-first in v1** with a mobile companion later (apps/mobile). The
heavy desktop capabilities (full-screen capture + remote control) live in an
**Electron desktop agent**, because a browser tab cannot do them.

## The three planes

The system is deliberately split into three planes so each can be reasoned
about (and degraded) independently.

### 1. Media plane — LiveKit Cloud (SFU)

All real-time A/V flows through **LiveKit Cloud**. We never relay media
ourselves. One LiveKit **room** per session (`LabSession.livekitRoom`). LiveKit
carries:

- cam/mic tracks (teacher broadcast, student cams),
- screen-share tracks (`source: screen_share`),
- a **data channel** (`canPublishData`) for the fast-moving live-map signals
  (cursor/status pulses, hand raises, reactions, share intents).

Credentials are **env-only, never hard-coded**:

| Var | Where | Purpose |
|---|---|---|
| `LIVEKIT_API_KEY` | server | mint access tokens |
| `LIVEKIT_API_SECRET` | server | sign access tokens + verify egress webhooks |
| `LIVEKIT_URL` | server | server-side room/egress admin (`RoomServiceClient`) |
| `NEXT_PUBLIC_LIVEKIT_URL` | client | ws URL the browser connects to |

The `livekit-server-sdk` (token mint + room/egress admin) and `livekit-client`
/ `@livekit/components-react` (browser) deps are installed by the parent **after**
this workflow — do not block on their import resolving.

### 2. Control plane — Next.js `/api` routes

Plain App Router route handlers in `apps/web`, following the existing
**Bearer-token + admin SDK** pattern (`requireVerifiedUser(req)` from
`apps/web/src/lib/server/classroomAccess.ts`). The control plane is the only
thing that:

- resolves the caller's **role** for a session (teacher / student / observer)
  from class membership — *never* trusts a client-supplied role,
- mints **LiveKit access tokens** with role-derived grants,
- opens/closes sessions and flips settings,
- writes the **authoritative roster** + **append-only audit log** to Firestore,
- starts/stops **egress** (recording) and ingests its completion webhook.

A small server lib (proposed `apps/web/src/lib/server/lab/`) holds: collection
consts + serializers (`store.ts`), token minting + grant tables (`livekit.ts`),
access resolution (`access.ts` — owner teacher / enrolled student / observer /
platform admin), and egress/recording helpers (`recording.ts`). This mirrors
the `lib/server/projectEval/` layout.

### 3. Agent plane — Electron desktop agent

An **installable desktop agent** (Electron) the user runs alongside the browser.
It exists for the two things the web sandbox can't do:

- **Full-screen / multi-monitor capture** beyond `getDisplayMedia` limits, and a
  reliable "share this whole machine" experience.
- **Remote control** — injecting mouse/keyboard so a teacher can drive a
  student's machine (consent-gated; see Security & consent).

The agent authenticates with the **same Firebase auth** (device-pairing token
from the web app), pulls a LiveKit token from the *same* control-plane route,
and publishes its capture as a LiveKit track. Remote-control input rides the
LiveKit data channel as `control_*` events. The web app is fully usable without
the agent — it just falls back to browser `getDisplayMedia` sharing and disables
remote control. v1 ships the protocol + web side; the signed installer is a
later phase.

```
            ┌──────────────────────── Media plane ────────────────────────┐
  Browser ─▶│  LiveKit Cloud room  (cam/mic/screen tracks + data channel)  │◀─ Electron agent
   (web)    └──────────────────────────────────────────────────────────────┘     (capture +
     │                         ▲ token                                            remote control)
     │ Bearer token            │                                                       │
     ▼                         │                                                       ▼
  ┌───────────────── Control plane: Next.js /api (admin SDK) ─────────────────┐  device-pair token
  │  resolve role · mint LiveKit token · open/close · settings · egress       │◀──────┘
  └───────────────┬───────────────────────────────────────────┬──────────────┘
                  ▼ authoritative                              ▼ webhook
        Firestore (labSessions / participants / events)   LiveKit egress → Storage → labRecordings
```

## Firestore data model

All collections are **server-only** (admin SDK via `/api`; explicit-deny in
`firebase/firestore.rules`, no client SDK reads/writes), exactly like the
project-eval collections.

| Path | Type | Notes |
|---|---|---|
| `labSessions/{sessionId}` | `LabSession` | the session document |
| `labSessions/{sessionId}/participants/{uid}` | `LabParticipant` | authoritative roster row, one per joiner; `seat`, final `status`, `joinedAt`/`leftAt` |
| `labSessions/{sessionId}/events/{autoId}` | `LabEvent` | append-only audit log + analytics mirror |
| `labRecordings/{recordingId}` | `LabRecording` | one row per recording, `classId` denormalized for class-scoped lists |

**Why a participants subcollection AND LiveKit?** LiveKit knows who is connected
*right now*; Firestore is the durable record of who was *ever* here, their seat,
hand-raise history, and final status — needed for attendance, analytics, and
rebuilding `LabRoomState` for a late joiner or the replay. The live map reads
LiveKit for sub-second presence and reconciles against the roster on join.

**Dates:** documents use Firestore `Date`; the fields that travel over the
LiveKit data channel (`LabParticipant.handRaisedAt`, `LabEvent.ts`) are epoch
millis so they JSON-serialize without a Timestamp dance (same rationale as the
aiInterview transcript).

### Indexes (`firebase/firestore.indexes.json`, deploy via `pnpm deploy:indexes`)

- `labSessions`: `(classId ASC, startedAt DESC)` — class session history;
  `(teacherId ASC, status ASC)` — a teacher's live/scheduled labs.
- `events` (collection-group): `(sessionId ASC, ts ASC)` — ordered replay/audit.
- `labRecordings`: `(classId ASC, createdAt DESC)` — class recordings list.

## LiveKit permission model

Grants are derived **server-side** from the caller's resolved `LabRole` and
baked into the access token (`VideoGrant`). The client never asserts its role.

| Capability (`VideoGrant`) | teacher | student | observer |
|---|:---:|:---:|:---:|
| `roomAdmin` | ✅ | — | — |
| `roomJoin` (room-scoped) | ✅ | ✅ | ✅ |
| `canPublish` (cam/mic/screen) | ✅ all | ✅ own screen + cam | — |
| `canPublishSources` | — (all) | `["camera","microphone","screen_share","screen_share_audio"]` | — |
| `canSubscribe` | ✅ | ✅ | ✅ |
| `canPublishData` | ✅ | ✅ | ✅ (reactions only) |

- **teacher** = `roomAdmin` → can mute/remove, force-unpublish a runaway share,
  spotlight, start/stop egress, and is the only identity allowed to issue
  `control_request` against a student. Publishes broadcast to all.
- **student** = publishes their **own** cam + screen, subscribes to everything
  permitted, and uses data for hand-raise/status/reactions. Peer-share is
  allowed at the media layer but **policed by `settings.allowPeerShare`** in the
  control plane + UI (a peer `share_start` to a non-teacher target is rejected
  when off).
- **observer** = `canSubscribe` only (+ optional data for reactions). Late
  joiners, TAs, auditors. Cannot publish any media.

Token identity = the Firebase **uid** (`LabTokenResponse.identity`), so LiveKit
participant identity maps 1:1 to our roster doc id. Participant **metadata**
(set via the token / `RoomService.updateParticipant`) carries `role`, `seat`,
and `displayName` so every client can render the map from LiveKit alone.

## API routes

Teacher-scoped routes live under `/api/teacher/lab/...`; student/shared routes
under `/api/lab/...` (matching the project-eval split). All use the
Bearer-token + admin SDK pattern; auth column names the gate.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET / POST | `/api/teacher/lab/sessions` | `requireTeacher` | list a teacher's sessions / create one (validates class ownership) |
| GET / PATCH / DELETE | `/api/teacher/lab/sessions/[sessionId]` | session owner / admin | detail / edit title+settings / delete (only when not `live`) |
| POST | `/api/teacher/lab/sessions/[sessionId]/open` | owner | `scheduled` → `live` (provisions LiveKit room; auto-records if set) |
| POST | `/api/teacher/lab/sessions/[sessionId]/end` | owner | `live` → `ended` (stops egress, tears down room) |
| POST | `/api/teacher/lab/sessions/[sessionId]/record` | owner | start/stop recording mid-session (`{action:'start'\|'stop'}`; consent-gated) |
| POST | `/api/teacher/lab/sessions/[sessionId]/spotlight` | owner | pin/unpin a participant for the room (`{targetUid\|null}`) |
| POST | `/api/teacher/lab/sessions/[sessionId]/control` | owner | request/grant-check/revoke remote control of a student (`{targetUid, action}`) |
| POST | `/api/teacher/lab/sessions/[sessionId]/moderate` | owner | mute / unpublish / remove a participant (`{targetUid, action}`) |
| GET | `/api/teacher/lab/sessions/[sessionId]/events` | owner / admin | paged audit log for review/analytics |
| GET | `/api/lab/sessions` | `requireVerifiedUser` | sessions visible to the student (their classes), live ones first |
| GET | `/api/lab/sessions/[sessionId]` | enrolled / owner | session + `LabRoomState` snapshot to render the map |
| POST | `/api/lab/sessions/[sessionId]/token` | enrolled / owner | **mint LiveKit token** with role-derived grants (`LabTokenRequest`→`LabTokenResponse`) |
| POST | `/api/lab/sessions/[sessionId]/presence` | participant | upsert roster row + emit `join`/`leave`/status `LabEvent` (mirror of data channel) |
| POST | `/api/lab/sessions/[sessionId]/hand` | student | raise/lower hand (`{raised:boolean}`; sets `handRaisedAt`, emits event) |
| POST | `/api/lab/sessions/[sessionId]/share` | participant | declare a `share_start`/`share_end` (`{kind:'peer'\|'view'\|'broadcast', targetUids, action}`; enforces `allowPeerShare`) |
| POST | `/api/lab/sessions/[sessionId]/consent` | target user | grant/deny a pending record or control consent (`{kind:'record'\|'control', accept:boolean}`) |
| GET | `/api/lab/recordings/[recordingId]` | class member / owner | recording metadata + signed playback URL (when `ready`) |
| GET | `/api/classes/[classId]/lab/sessions` | `assertClassEnrollment` | class hub: this class's sessions + recordings |
| POST | `/api/lab/egress/webhook` | **LiveKit signature** (HMAC via `LIVEKIT_API_SECRET`) | egress completion → finalize `labRecordings` (`processing`→`ready`/`failed`, set `url`/`durationSec`) |

Notes:
- Token mint is the security choke point: it re-resolves the role server-side
  every call, so revoking enrollment or ending the session invalidates the next
  token even if the client is stale.
- The webhook is the **only** unauthenticated-by-Bearer route; it is verified by
  LiveKit's HMAC signature against `LIVEKIT_API_SECRET`.

## Live-map signalling

The map must feel instant, so live signals go over **LiveKit, not Firestore**:

1. **Presence + identity** — each client reads LiveKit participants and their
   **metadata** (`role`, `seat`, `displayName`) to place avatars. Connect/
   disconnect drives appear/disappear.
2. **Status, hand-raise, reactions, share intents** — published as **data
   messages** (`canPublishData`) on a typed channel; every client updates its
   local map optimistically.
3. **Persistence / analytics mirror** — the actor (or the teacher's client for
   room-wide acts) also POSTs the corresponding `/api/lab/.../{presence|hand|
   share|...}` route, which writes the roster delta and appends a `LabEvent`.
   This keeps the durable audit trail + replay chapters **without** every cursor
   wiggle hitting Firestore (we mirror state *transitions*, not every frame).
4. **Reconnect / late join** — a fresh client calls `GET /api/lab/sessions/[id]`
   for a `LabRoomState` snapshot, then layers live data messages on top.

`LabConnection[]` (the lines drawn between avatars) is derived from the union of
active LiveKit screen-share tracks and the `sharingTo` roster field:
`view` (student→teacher), `peer` (student↔student), `broadcast` (teacher→room).

## Security & consent

Live A/V + remote control are intrusive, so consent and audit are first-class —
and shaped to be **DPDP-** (India) and **FERPA-aware** (the platform's CU /
education users).

- **Explicit consent before recording.** `record_start` requires an
  acknowledged consent step; participants see a persistent **on-screen recording
  indicator** the entire time. Consent + each start/stop is logged as a
  `LabEvent` (`record_start`/`record_stop` with actor + ts).
- **Explicit consent before remote control.** `control_request` (teacher) does
  nothing until the target student returns `control_grant` via `/consent`. While
  active, an **always-on banner** shows on the controlled machine ("Teacher can
  control your screen"); either side — or a disconnect — fires `control_revoke`.
  Remote control is desktop-agent only and never silent.
- **Always-on indicators.** Recording, being-spotlighted, sharing, and
  being-controlled each render a non-dismissable on-screen indicator. No covert
  states.
- **Full audit log.** Every `LabEventType` is appended to
  `labSessions/{id}/events` with `actorUid`, optional `targetUid`, and `ts` —
  joins, shares, hands, feedback, control handshakes, spotlights, recording
  boundaries. This is the consent + safeguarding trail.
- **Role resolution is server-side & re-checked per token.** A student can never
  obtain `roomAdmin`; an observer can never publish; an un-enrolled user gets no
  token. Ending a session or un-enrolling invalidates the next token.
- **Retention (DPDP/FERPA-aware).** Recordings carry a class-scoped retention
  policy (default: teacher-deletable any time; auto-expire after a configurable
  window). Playback URLs are signed + short-lived, access-gated to class members
  + the owning teacher/institute. Recordings and the event log are deletable on
  request; deletion is itself audited.
- **Secrets.** LiveKit creds come from **env only**, never committed. The egress
  webhook is HMAC-verified with `LIVEKIT_API_SECRET`.

## Phase plan (0 → 5)

- **Phase 0 — Contract & scaffold.** *(this workflow)* Types in
  `packages/types/src/lab.ts`, this RFC, route list. No runtime yet.
- **Phase 1 — Control plane + token.** Server lib (`lib/server/lab/`),
  session CRUD + open/end, **LiveKit token mint** with role grants, server-only
  Firestore rules + indexes (`pnpm deploy:rules` / `deploy:indexes`). Verifiable
  with a stub client that just joins a room.
- **Phase 2 — Live map (web).** Join a session, render the seat-gridded avatar
  map from LiveKit metadata, status/hand-raise/reaction data messages mirrored
  to `labEvents`, presence reconciliation. The teacher broadcast (1→N) and
  student→teacher share land here.
- **Phase 3 — Peer share + spotlight + moderation.** `allowPeerShare` peer
  shares, teacher spotlight, mute/unpublish/remove, the `LabConnection` lines on
  the map.
- **Phase 4 — Recording & replay.** LiveKit egress with consent gating + on-air
  indicator, the egress webhook → `labRecordings`, event-derived chapter
  markers, the class recordings list + replay player.
- **Phase 5 — Desktop agent + remote control.** Signed Electron installer,
  device pairing with Firebase auth, full-screen capture, consent-gated remote
  control over the data channel with the always-on controlled banner. Then the
  **mobile companion** (view + join, no remote control).
