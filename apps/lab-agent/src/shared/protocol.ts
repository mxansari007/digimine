/**
 * Shared wire contract + config for the Lab Agent.
 *
 * This module is the single place the main process, the preload bridge, and the
 * renderer agree on shapes. The agent lives OUTSIDE the pnpm workspace (like
 * apps/mobile), so it can't import `@digimine/types` directly — instead it
 * mirrors the *subset* of `packages/types/src/lab.ts` it actually needs over the
 * wire. Keep these in sync with that file by hand; they are intentionally a
 * narrow slice (token exchange + the `control_*` data-channel events), not the
 * whole Firestore model.
 */

// ─────────────────────────────────────────────────────────────────────
// Config (env-only; NEVER hard-code secrets)
// ─────────────────────────────────────────────────────────────────────

/**
 * Where the PlacementRanker backend lives — the SAME Next.js API the web and
 * mobile apps hit. The agent only ever calls the control plane (Bearer token);
 * it never talks to LiveKit's REST API or holds any LiveKit secret. Override
 * with LAB_AGENT_API_URL; defaults to local `next dev`.
 *
 * NOTE: there are no LiveKit creds here on purpose. The agent receives a
 * short-lived, role-scoped LiveKit *access token* + ws url from the control
 * plane (`POST /api/lab/sessions/[sessionId]/token`). `LIVEKIT_API_KEY` /
 * `LIVEKIT_API_SECRET` live server-side only and must never reach this process.
 */
export const API_URL = process.env.LAB_AGENT_API_URL || "http://localhost:3000";

/** Control-plane endpoints the agent calls (mirrors docs/VIRTUAL_LAB.md). */
export const ENDPOINTS = {
  /**
   * Mint a LiveKit access token for a session. Body is `LabTokenRequest`
   * (`{ sessionId }`), response is `LabTokenResponse`. The agent authenticates
   * with a Firebase ID token (Bearer) obtained via device pairing (below).
   */
  token: (_sessionId: string) => `/api/lab/token`,
  /**
   * Declare a share opening/closing so the roster + audit log + live-map lines
   * stay correct (mirror of the data channel). Body:
   * `{ kind, targetUids, action }`.
   */
  share: (sessionId: string) => `/api/lab/sessions/${sessionId}/share`,
  /**
   * Grant/deny a pending control (or record) consent. Body:
   * `{ kind: 'control' | 'record', accept: boolean }`. This is the durable,
   * server-side record of the student's consent — the data-channel
   * `control_grant`/`control_revoke` messages are the fast path, this is the
   * audited one.
   */
  consent: (sessionId: string) => `/api/lab/sessions/${sessionId}/consent`,
} as const;

// ─────────────────────────────────────────────────────────────────────
// Token exchange — mirror of LabTokenRequest / LabTokenResponse
// ─────────────────────────────────────────────────────────────────────

/** Mirror of `LabRole` in @digimine/types. */
export type LabRole = "teacher" | "student" | "observer";

/** Mirror of `LabTokenRequest`. */
export interface LabTokenRequest {
  sessionId: string;
}

/** Mirror of `LabTokenResponse`. */
export interface LabTokenResponse {
  token: string;
  /** LiveKit ws url to connect to (server mirrors NEXT_PUBLIC_LIVEKIT_URL). */
  url: string;
  role: LabRole;
  /** LiveKit participant identity (the Firebase uid). */
  identity: string;
  room: string;
}

// ─────────────────────────────────────────────────────────────────────
// Pairing — how the desktop agent gets a Firebase ID token
// ─────────────────────────────────────────────────────────────────────

/**
 * The agent never sees a password. The student signs in on the web app, which
 * shows a short-lived **pairing code**; they type it into the agent. The agent
 * POSTs the code to the web app, which returns a Firebase **custom token** the
 * agent exchanges (via the Firebase Auth REST API) for an ID token it then sends
 * as `Authorization: Bearer` on every control-plane call.
 *
 * Phase 5 wires the real pairing route; this scaffold STUBS it (see
 * src/main.ts → resolveAuthToken) so the IPC surface + UI are exercisable now.
 */
export interface PairResult {
  /** Legacy field, kept for the IPC shape. The real flow returns a session-scoped
   *  LiveKit token (held in main), not a Firebase ID token — this stays "". */
  idToken: string;
  /** The LiveKit participant identity the agent joins under (`<uid>__agent`). */
  uid: string;
  /** Display name for the local UI (optional). */
  displayName?: string;
  /** The lab session the code paired to — auto-fills the Session ID field. */
  sessionId?: string;
}

// ─────────────────────────────────────────────────────────────────────
// Remote-control data-channel protocol (rides the LiveKit data channel)
// ─────────────────────────────────────────────────────────────────────

/**
 * THE WIRE CONTRACT WITH THE WEB. This block is a 1:1 mirror of the
 * remote-control subset of `apps/web/src/components/lab/labProtocol.ts` — the
 * web client (the teacher) is the canonical author of these shapes and this
 * agent is the other endpoint, so they MUST stay byte-identical. The agent
 * RECEIVES `ctl_req` + `ctl_in` and SENDS `ctl_grant` / `ctl_deny` /
 * `ctl_revoke`; addressing is point-to-point via `from`/`to` +
 * `publishData`'s `destinationIdentities`, NOT a topic (the old `CONTROL_TOPIC`
 * is gone). Keep these in lock-step with the web file by hand.
 *
 * SECURITY MODEL (non-negotiable, ENFORCED by this agent):
 *   • The teacher can only ASK (`ctl_req`). Input (`ctl_in`) is DROPPED unless a
 *     grant for the CURRENT request is active AND the LiveKit sender identity is
 *     the very teacher the student granted. There is no "start controlling"
 *     verb — control is armed ONLY by the student's explicit grant.
 *   • The student GRANTS/DENIES explicitly in the agent's consent dialog
 *     (`ctl_grant` / `ctl_deny`) and can `ctl_revoke` instantly at any time; a
 *     disconnect implicitly revokes. An always-on "Teacher is viewing /
 *     controlling" banner is shown the entire time.
 */

/** The teacher asks `to`'s agent (this machine) to begin a control session. */
export interface LabControlRequestMsg {
  t: "ctl_req";
  /** Teacher's identity (the would-be controller). */
  from: string;
  /** Student's identity (whose agent is being asked — i.e. us). */
  to: string;
}

/** This agent CONSENTED to `to`'s (the teacher's) pending request. */
export interface LabControlGrantMsg {
  t: "ctl_grant";
  /** Student's identity (this controlled machine / the grantor). */
  from: string;
  /** Teacher's identity the grant is answering. */
  to: string;
}

/** This agent DECLINED `to`'s (the teacher's) pending request. */
export interface LabControlDenyMsg {
  t: "ctl_deny";
  /** Student's identity (who declined — us). */
  from: string;
  /** Teacher's identity the denial is answering. */
  to: string;
}

/**
 * Control ENDED. Sent by EITHER side: the teacher to stop driving (`from`=teacher),
 * or this agent to pull consent mid-session (`from`=student). A disconnect is
 * treated as an implicit revoke by both ends. Idempotent — a receiver with no
 * active control session simply ignores it.
 */
export interface LabControlRevokeMsg {
  t: "ctl_revoke";
  /** Whoever is ending control (teacher or student). */
  from: string;
  /** The other party. */
  to: string;
}

/**
 * A pointer event in NORMALIZED screen space. `x`/`y` are fractions 0..1 of the
 * shared display's width/height (top-left origin), independent of this agent's
 * real resolution — the agent multiplies by its captured screen size (nut-js
 * `screen.width()/height()`) to get physical pixels. `button` is the 0-based DOM
 * `MouseEvent.button` (0=left, 1=middle, 2=right); omitted for a plain `move`.
 */
export interface LabControlPointerEvent {
  kind: "pointer";
  action: "move" | "down" | "up";
  /** 0..1 fraction of the shared screen width. */
  x: number;
  /** 0..1 fraction of the shared screen height. */
  y: number;
  /** DOM MouseEvent.button (0=left,1=middle,2=right); absent for `move`. */
  button?: number;
}

/**
 * A scroll/wheel event. `dx`/`dy` are DOM `WheelEvent.deltaX/Y` (pixels-ish);
 * the agent forwards them to nut-js `mouse.scrollUp/Down/Left/Right`. Not
 * normalized — deltas are relative, not positional.
 */
export interface LabControlScrollEvent {
  kind: "scroll";
  dx: number;
  dy: number;
}

/**
 * A keyboard event. `key` is the DOM `KeyboardEvent.key` (produced character /
 * named key, e.g. `"a"`, `"Enter"`); `code` is the physical `KeyboardEvent.code`
 * (e.g. `"KeyA"`, `"Enter"`) — the agent prefers `code` for layout-stable
 * mapping and falls back to `key`. `mods` carries the live modifier state so the
 * agent can hold/release Ctrl/Alt/Shift/Meta around the keypress.
 */
export interface LabControlKeyEvent {
  kind: "key";
  action: "down" | "up";
  /** DOM KeyboardEvent.key (character or named key). */
  key: string;
  /** DOM KeyboardEvent.code (physical key, layout-independent). */
  code: string;
  /** Live modifier state at the moment of the event. */
  mods?: { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean };
}

/**
 * The NORMALIZED input event carried inside a `ctl_in` — a discriminated union
 * on `kind`. The teacher's web client produces these from raw DOM pointer /
 * wheel / keyboard events; this agent replays them via nut-js.
 */
export type LabControlInputEvent =
  | LabControlPointerEvent
  | LabControlScrollEvent
  | LabControlKeyEvent;

/**
 * One unit of remote input from the teacher to this controlled agent. Carries
 * only `to` (this agent's identity) — the teacher is the implicit `from` (the
 * sole controller of the active grant; the agent verifies the LiveKit SENDER
 * identity matches the grant rather than trusting an embedded `from`, keeping
 * the high-frequency packet lean). The agent MUST drop every `ctl_in` unless a
 * grant for the current request is active.
 */
export interface LabControlInputMsg {
  t: "ctl_in";
  /** This controlled agent's identity (the one that should replay `ev`). */
  to: string;
  /** The normalized input event to replay. */
  ev: LabControlInputEvent;
}

/**
 * Everything sent over the lab data channel that the AGENT cares about. This is
 * the remote-control subset of the web's full `LabDataMsg` union: the agent only
 * speaks the `ctl_*` dialect (the lab's hand/status/chat/share/record/spotlight
 * packets fan out to the room but aren't the agent's concern, so we don't model
 * them here). `decode` returns `null` for any non-control packet, which the
 * renderer simply ignores.
 */
export type LabDataMsg =
  | LabControlRequestMsg
  | LabControlGrantMsg
  | LabControlDenyMsg
  | LabControlRevokeMsg
  | LabControlInputMsg;

/** Set of valid `t` discriminants — used to validate decoded packets. */
const LAB_MSG_TYPES: readonly LabDataMsg["t"][] = [
  "ctl_req",
  "ctl_grant",
  "ctl_deny",
  "ctl_revoke",
  "ctl_in",
];

const CTRL_TEXT_ENCODER = new TextEncoder();
const CTRL_TEXT_DECODER = new TextDecoder();

/**
 * Encode a control `LabDataMsg` to the bytes LiveKit's `publishData` puts on the
 * wire. JSON + UTF-8 — identical to the web encoder so a packet is symmetric.
 */
export function encode(msg: LabDataMsg): Uint8Array {
  return CTRL_TEXT_ENCODER.encode(JSON.stringify(msg));
}

/**
 * Decode a `RoomEvent.DataReceived` payload into a control `LabDataMsg`, or
 * `null` for anything that isn't one of our well-formed control packets (the
 * lab's own hand/status/chat/etc. packets, foreign data, truncated bytes, an
 * unknown `t`) so the renderer can simply `if (!msg) return`. Per-variant fields
 * are validated so a malformed packet can never smuggle a bad grant/revoke or a
 * partially-decoded input toward nut-js. Ported verbatim from the web decoder.
 */
export function decode(payload: Uint8Array): LabDataMsg | null {
  let obj: unknown;
  try {
    obj = JSON.parse(CTRL_TEXT_DECODER.decode(payload));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (typeof o.t !== "string" || !(LAB_MSG_TYPES as readonly string[]).includes(o.t)) {
    return null;
  }
  switch (o.t as LabDataMsg["t"]) {
    case "ctl_req":
    case "ctl_grant":
    case "ctl_deny":
    case "ctl_revoke": {
      // All four handshake messages share the `{ from, to }` shape. Both must be
      // non-empty identities or the packet is meaningless (a missing `to` would
      // let a control message be mis-addressed) — drop it rather than honour a
      // half-formed grant/revoke. `t` is the validated discriminant, so it
      // narrows to the exact literal union member.
      const t = o.t as "ctl_req" | "ctl_grant" | "ctl_deny" | "ctl_revoke";
      if (typeof o.from !== "string" || !o.from) return null;
      if (typeof o.to !== "string" || !o.to) return null;
      return { t, from: o.from, to: o.to };
    }
    case "ctl_in": {
      // Directed input: `to` must be a real identity and `ev` a well-formed
      // normalized event. A malformed `ev` is dropped WHOLE — we never replay a
      // partially-decoded input (e.g. a key with no `code`, a pointer with a NaN
      // coordinate) on the student's machine.
      if (typeof o.to !== "string" || !o.to) return null;
      const ev = decodeControlInputEvent(o.ev);
      return ev ? { t: "ctl_in", to: o.to, ev } : null;
    }
    default:
      return null;
  }
}

// ── Control helpers — constructors + the normalized-event validator ──

/** A finite number in [0,1] (normalized screen coordinate). */
function isUnit(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
}

/** A finite number (scroll delta) — clamps NaN/Infinity out of the input path. */
function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Validate + narrow an untrusted value into a `LabControlInputEvent`, or null.
 * THE SECURITY-CRITICAL GATE for the high-frequency input path: the agent calls
 * it before ANYTHING reaches nut-js, so a coordinate must be a real 0..1
 * fraction, a key event must carry both `key` and `code`, and unknown `kind`s
 * are rejected. Ported VERBATIM from the web `labProtocol.ts` so the shape check
 * is identical on both ends of the wire.
 */
export function decodeControlInputEvent(raw: unknown): LabControlInputEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  switch (o.kind) {
    case "pointer": {
      const action = o.action;
      if (action !== "move" && action !== "down" && action !== "up") return null;
      if (!isUnit(o.x) || !isUnit(o.y)) return null;
      const ev: LabControlPointerEvent = { kind: "pointer", action, x: o.x, y: o.y };
      // `button` is only meaningful for down/up; keep it when it's a sane 0-based
      // index, drop it otherwise (a `move` never carries one).
      if (typeof o.button === "number" && Number.isInteger(o.button) && o.button >= 0) {
        ev.button = o.button;
      }
      return ev;
    }
    case "scroll":
      if (!isFiniteNum(o.dx) || !isFiniteNum(o.dy)) return null;
      return { kind: "scroll", dx: o.dx, dy: o.dy };
    case "key": {
      const action = o.action;
      if (action !== "down" && action !== "up") return null;
      if (typeof o.key !== "string" || typeof o.code !== "string") return null;
      const ev: LabControlKeyEvent = { kind: "key", action, key: o.key, code: o.code };
      if (o.mods && typeof o.mods === "object") {
        const m = o.mods as Record<string, unknown>;
        ev.mods = {
          ctrl: m.ctrl === true,
          alt: m.alt === true,
          shift: m.shift === true,
          meta: m.meta === true,
        };
      }
      return ev;
    }
    default:
      return null;
  }
}

/** Build a `ctl_req` (teacher → student's agent). */
export function controlRequest(from: string, to: string): LabControlRequestMsg {
  return { t: "ctl_req", from, to };
}

/** Build a `ctl_grant` (this agent → teacher). */
export function controlGrant(from: string, to: string): LabControlGrantMsg {
  return { t: "ctl_grant", from, to };
}

/** Build a `ctl_deny` (this agent → teacher). */
export function controlDeny(from: string, to: string): LabControlDenyMsg {
  return { t: "ctl_deny", from, to };
}

/** Build a `ctl_revoke` (either side ends control). */
export function controlRevoke(from: string, to: string): LabControlRevokeMsg {
  return { t: "ctl_revoke", from, to };
}

/** Build a `ctl_in` (teacher → controlled student's agent). */
export function controlInput(to: string, ev: LabControlInputEvent): LabControlInputMsg {
  return { t: "ctl_in", to, ev };
}

/** Narrow a decoded `LabDataMsg` to the remote-control subset (handshake + input). */
export function isControlMsg(
  msg: LabDataMsg
): msg is
  | LabControlRequestMsg
  | LabControlGrantMsg
  | LabControlDenyMsg
  | LabControlRevokeMsg
  | LabControlInputMsg {
  return (
    msg.t === "ctl_req" ||
    msg.t === "ctl_grant" ||
    msg.t === "ctl_deny" ||
    msg.t === "ctl_revoke" ||
    msg.t === "ctl_in"
  );
}

// ─────────────────────────────────────────────────────────────────────
// IPC contract (renderer ⇄ main) — names shared by preload + both ends
// ─────────────────────────────────────────────────────────────────────

/**
 * IPC channel names. The preload bridge (src/preload.ts) is the ONLY thing that
 * may touch `ipcRenderer`; the renderer calls the typed `window.labAgent`
 * methods, which map onto these. Keeping the names here stops main and preload
 * drifting.
 */
export const IPC = {
  /** renderer → main: ask main to resolve a Bearer token for a pairing code. */
  pair: "lab:pair",
  /** renderer → main: ask main to mint a LiveKit token for a session. */
  getToken: "lab:get-token",
  /** renderer → main: enumerate capturable screens/windows (desktopCapturer). */
  listSources: "lab:list-sources",
  /**
   * renderer → main: inject ONE normalized remote-control input
   * (`LabControlInputEvent`) via the native backend. The renderer only ever
   * sends this while a consent grant is active AND the packet's sender identity
   * matched the granted teacher; main double-checks the backend is present.
   */
  injectInput: "lab:inject-input",
  /** renderer → main: report whether native input (nut-js) is available. */
  nativeStatus: "lab:native-status",
  /** main → renderer: push status/log lines into the window. */
  status: "lab:status",
  /** renderer → main: a consent decision was made (for the menu/tray + audit). */
  consentChanged: "lab:consent-changed",
} as const;

/** A capturable source returned by desktopCapturer, trimmed for the renderer. */
export interface CaptureSource {
  id: string;
  name: string;
  /** data: URL of a thumbnail, so the picker can preview without extra IPC. */
  thumbnailDataUrl: string;
}

/** Live local state the renderer reflects (and the banner keys off). */
export interface ControlState {
  /** A screen share is currently being published. */
  sharing: boolean;
  /**
   * A remote-control consent grant is currently active. While true (and only
   * while true) the renderer forwards `ctl_in` input to main → nut-js, and the
   * always-on banner shows the red "CONTROLLING" state.
   */
  controlled: boolean;
  /**
   * Identity of the teacher currently controlling this machine, when
   * `controlled`. This is the grant's bound controller: the renderer drops any
   * `ctl_in` whose LiveKit sender identity isn't this exact uid, so a third
   * party on the room can never inject even mid-grant.
   */
  controllerUid?: string;
  /** Native input backend (nut-js) loaded OK — false ⇒ control is unavailable. */
  nativeInputAvailable: boolean;
}
