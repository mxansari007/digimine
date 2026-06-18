# PlacementRanker Lab Agent

The installable **desktop agent** for the [Virtual Lab](../../docs/VIRTUAL_LAB.md).
It exists for the two things a browser tab cannot do:

1. **Full-screen / multi-monitor capture** — a reliable "share this whole
   machine" experience beyond `getDisplayMedia` limits.
2. **Remote control** — letting a teacher drive a *consenting* student's mouse
   and keyboard, so they can take over and demonstrate a fix.

This is the **Agent plane** of the three-plane design (Media = LiveKit Cloud,
Control = the Next.js `/api` routes, Agent = this app). The web app works fully
without it — it just falls back to browser screen-share and disables remote
control.

> Status: **Capture + control implemented.** The agent connects to the lab's
> LiveKit room, publishes the **full desktop** as a screen-share track, runs the
> real consent-gated remote-control handshake over the data channel, and injects
> mouse/keyboard via **nut-js**. The consent / banner / teardown UX is real. The
> ONLY remaining stub is **device pairing → Firebase ID token** (Phase 5; see
> "What's stubbed" below). It is TypeScript-clean and runnable today.

This project lives **outside** the pnpm workspace (like `apps/mobile`) and
manages its own dependencies — run `npm install` *inside this folder*, not from
the repo root.

---

## Architecture in one breath

```
 ┌─────────── this Electron app ───────────┐
 │  main process (privileged)               │   IPC (typed preload bridge only)
 │   • window + system tray                 │◀──────────────────────────────────┐
 │   • device pairing → Firebase ID token   │                                    │
 │   • desktopCapturer (list screens)       │   renderer (sandboxed)             │
 │   • nut-js input injection  ◀────────────┼── injectInput() while consent ON   │
 │   • mints LiveKit token via control plane│   • capture screen → LiveKit pub   │
 └──────────────┬───────────────────────────┘   • consent dialog + banner        │
                │ Bearer (Firebase ID token)     • Stop / Revoke control ────────┘
                ▼
   Next.js control plane  POST /api/lab/sessions/[id]/token  ──▶  LiveKit access token
                                                                   (role-scoped, server-derived)
                ▼
        LiveKit Cloud room  ── screen track + `lab.control` data channel ──▶ teacher
```

- The agent **never holds a LiveKit secret.** It authenticates to the *same*
  control plane the web/mobile apps use (Firebase ID token via device pairing)
  and receives a short-lived, **role-scoped LiveKit access token** in return.
- Remote control rides the LiveKit **data channel**, never the media tracks. It
  is **point-to-point**: every packet is *directed* via `publishData`'s
  `destinationIdentities` and addressed by the `from`/`to` identities in the
  shared `ctl_*` wire contract (`src/shared/protocol.ts`, a byte-for-byte mirror
  of `apps/web/src/components/lab/labProtocol.ts`). There is **no topic** — the
  old `lab.control` topic is gone; addressing is purely by identity.

---

## OS permission requirements

These are **operating-system** grants the user must approve once — they are not
something the app can self-grant.

### macOS

| Capability | Where the user grants it | Needed for |
|---|---|---|
| **Screen Recording** | System Settings → Privacy & Security → **Screen Recording** → enable the Lab Agent | capturing the screen at all (Catalina 10.15+) |
| **Accessibility** | System Settings → Privacy & Security → **Accessibility** → enable the Lab Agent | **remote control** (synthesising mouse/keyboard via nut-js) |
| Camera / Microphone | prompted on first use (strings in `package.json` → `build.mac.extendInfo`) | optional cam/mic share |

macOS gates Screen Recording and Accessibility through **TCC** at runtime — they
are *not* code-signing entitlements. After the first denial the OS won't
re-prompt; the user must toggle them manually in System Settings and **restart**
the agent. A signed + notarised build (see below) is required before macOS will
let users enable these for a distributed app.

### Windows

| Capability | Where | Needed for |
|---|---|---|
| Screen capture | works out of the box (no special prompt) | capturing the screen |
| **UAC / elevation** | the agent (or the input it injects) may require running **as administrator** to send input to elevated windows | remote control reaching elevated apps |
| Camera / Microphone | Settings → Privacy → Camera / Microphone | optional cam/mic share |

On Windows, synthetic input (nut-js → `SendInput`) **cannot drive a
higher-integrity window** than the agent itself. To control elevated apps the
agent must run elevated; otherwise input to those windows is silently dropped by
the OS. The banner still reflects that control is "on" — document this limit to
users.

> **Linux** is not a v1 target. Wayland blocks both global screen capture and
> synthetic input without portals; X11 mostly works. Out of scope for now.

---

## Consent model

Live A/V and especially remote control are intrusive, so consent + audit are
first-class and **DPDP-** (India) / **FERPA-aware** (CU education users). This
mirrors the "Security & consent" section of the
[Virtual Lab RFC](../../docs/VIRTUAL_LAB.md).

1. **Sharing is user-initiated.** The student presses **"Share my screen"**. The
   OS Screen-Recording grant is an additional gate on top.
2. **Remote control requires an explicit, modal Allow.** When the teacher sends a
   `ctl_req` (over the data channel), the agent shows a **consent dialog**.
   **Nothing is injected until the student presses Allow.** On Allow the agent
   sends `ctl_grant` and **binds the grant to that teacher's identity**; on Deny
   it sends `ctl_deny`. There is *no* inbound message that can start control —
   only the dialog can arm it. Every `ctl_in` is then dropped unless a grant is
   active **and** the LiveKit *sender identity* equals the granted teacher (the
   `ctl_in` packet carries no `from`, so the sender identity is the authority —
   a third party on the room can't inject even mid-grant).
3. **An always-on, non-dismissable banner.** Whenever the screen is being shared
   and/or controlled, a fixed top banner is shown with **no close button**:
   - amber **"Your screen is being shared with your teacher"** while sharing,
   - red **"Your teacher is CONTROLLING your screen"** while controlled.
   It carries a **Stop sharing / Revoke control** button. There is no covert
   state — if a byte is leaving the machine, the banner is up.
4. **Revoke is instant and everywhere.** The student can end it from the banner
   button, the in-window **Stop / Revoke** controls, or the **system-tray**
   "Stop sharing / Revoke control" item (reachable even when the window is hidden
   behind the shared screen). Revoking cuts input *first*, then tears down media.
5. **Either side or a disconnect ends control.** A teacher `ctl_revoke`, the
   student's Stop/Revoke (which sends `ctl_revoke`), or a network drop all end
   control. On a `RoomEvent.Disconnected` the agent cuts injection **first**
   (locally — no point sending over a dead socket); a local revoke sends
   `ctl_revoke` so the teacher's side clears symmetrically.
6. **Everything is audited.** Consent grants/denials and start/stop are mirrored
   to the control plane (`POST /api/lab/sessions/[id]/consent`) and appended to
   the server-side event log (`labSessions/{id}/events`) as `control_request` /
   `control_grant` / `control_revoke` with `actorUid` + `ts`. The data-channel
   handshake is the fast path; Firestore is the durable, auditable record.
7. **Honesty about capability.** If the native input backend isn't available, the
   consent dialog says so and disables **Allow** — the student is never told
   control is possible when it isn't.

---

## Remote control / native input (nut-js)

Remote control is powered by **nut-js** (`@nut-tree-fork/nut-js`), listed as an
**optional** dependency on purpose:

- It ships **native (N-API) binaries** that target a stock Node ABI, **not**
  Electron's bundled Node — so it needs a **native rebuild** against this
  project's Electron version:

  ```bash
  npx @electron/rebuild -f -w @nut-tree-fork/nut-js
  ```

- If it is **missing or fails to load**, the agent logs a notice and **disables
  remote control** — screen-sharing keeps working. The dependency is loaded
  lazily in the **main process only** (never the renderer), so the dangerous
  capability has exactly one choke point.
- On macOS it additionally requires the **Accessibility** grant above; on
  Windows it may require **elevation** to reach elevated windows.

---

## Security notes

- **No secrets in the agent.** `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` live
  server-side only. The agent receives a short-lived, **role-scoped** LiveKit
  access token from the control plane and nothing more. Override the backend URL
  with `LAB_AGENT_API_URL` (defaults to `http://localhost:3000`).
- **Hard renderer sandbox.** `contextIsolation: true`, `nodeIntegration:
  false`. The renderer reaches the main process **only** through the typed
  preload bridge (`window.labAgent`) — a fixed set of operations, no
  general-purpose `invoke`, no Node, no `require`.
- **Bearer token never enters the renderer.** Pairing yields a Firebase ID token
  held in **main**; the renderer asks main to *use* it for control-plane calls,
  so the page can't exfiltrate it.
- **Single instance.** A second launch focuses the existing window instead of
  starting a second agent that could double-inject input.
- **Input is gated twice.** The renderer drops every input frame unless a consent
  grant is active; the main process additionally refuses to inject when the
  native backend is absent. Control can only be *started* by the consent dialog.
- **Tight CSP** on the renderer (`script-src 'self'`, connect limited to
  `https:`/`wss:`), so no remote code runs in the privileged window.
- **External links** open in the user's real browser, never inside the agent
  window.
- **Open external review.** Pair codes are one-time and short-lived; the real
  pairing route (Phase 5) issues a Firebase custom token, exchanged for an ID
  token — the agent never sees a password.

---

## Build & run

Prerequisites: Node 18+ and a C/C++ toolchain if you intend to rebuild nut-js
(Xcode Command Line Tools on macOS; Build Tools / `windows-build-tools` on
Windows).

```bash
# from inside apps/lab-agent (NOT the repo root)
npm install

# (optional) enable remote control by rebuilding the native backend
npx @electron/rebuild -f -w @nut-tree-fork/nut-js

# compile main + preload + renderer, copy the HTML, and launch Electron
npm run dev

# type-check only
npm run type-check

# package a signed installer (set real signing identity / notarization first)
npm run dist          # current OS
npm run dist:mac      # macOS .dmg/.zip
npm run dist:win      # Windows NSIS installer
```

Point the agent at a non-local backend (e.g. the Vercel deployment) with:

```bash
LAB_AGENT_API_URL=https://placementranker.example npm run dev
```

---

## What's implemented vs. stubbed

**Implemented (real):**

| Area | File | Notes |
|---|---|---|
| LiveKit connect + full-desktop publish | `src/renderer/renderer.ts` → `startShare` / `captureScreen` | mints a token via main, connects to the lab room, captures the whole desktop (desktopCapturer → `chromeMediaSource` getUserMedia), and `publishTrack`s it as a `ScreenShare` source under the `lab-share` name |
| Remote-control handshake (data channel) | `src/renderer/renderer.ts` → `handleControlData` | the canonical `ctl_*` contract: consent dialog on `ctl_req`, sends `ctl_grant`/`ctl_deny`, binds the grant to the teacher's identity, instant `ctl_revoke`, disconnect = implicit revoke |
| Input validation + injection mapping | `src/shared/protocol.ts` → `decodeControlInputEvent`; `src/main.ts` → `injectInput` | ported validator (0..1 coords, key needs `key`+`code`); maps normalised pointer → pixels (`screen.width/height` × `Point`), wheel → `scrollUp/Down/Left/Right`, keys via a DOM `code` → nut-js `Key` table with held modifiers |

**Still stubbed (Phase 5):**

| Area | File | Stub |
|---|---|---|
| Device pairing → Firebase ID token | `src/main.ts` → `resolveAuthToken` | accepts any non-empty code, returns a placeholder token/uid; real flow POSTs to a pairing route + exchanges a Firebase custom token for an ID token. Until this lands, `getToken` will 401 against a live backend |
| Control-plane mirror calls (`/share`, `/consent`) | `src/renderer/renderer.ts` → `postShare` / `postConsent` | logs the route + body; should route through main so the Bearer token stays out of the renderer (the data-channel handshake is the fast path; these are the durable audit) |
| Tray icon | `src/main.ts` → `createTray` | empty `nativeImage`; replace with a template image before packaging |

The capture + control paths degrade gracefully: if `livekit-client` is somehow
absent the consent/banner/teardown UX still runs in STUB mode, and if **nut-js**
is missing the consent dialog disables **Allow** (control is honestly reported as
unavailable) while screen-sharing keeps working.

See [`docs/VIRTUAL_LAB.md`](../../docs/VIRTUAL_LAB.md) → *Phase plan* for how this
fits the broader rollout (the agent is **Phase 5**).
