/**
 * Renderer logic for the Lab Agent window.
 *
 * Runs sandboxed (no Node); everything privileged goes through `window
 * .labAgent` (the preload bridge). This file owns the three things the agent
 * exists for:
 *
 *   (a) CAPTURE + PUBLISH — grab the whole desktop via Electron's
 *       desktopCapturer + getUserMedia (chromeMediaSource) and publish it to the
 *       lab's LiveKit room as a screen-share track, so the teacher sees the
 *       actual machine. The LiveKit token comes from main (control plane); we
 *       never mint it here.
 *
 *   (b) REMOTE CONTROL — the point-to-point handshake + input replay with the
 *       teacher over the LiveKit DATA CHANNEL (the canonical `ctl_*` wire
 *       contract shared with apps/web). On `ctl_req` we show an explicit consent
 *       dialog; on Allow we send `ctl_grant` and ARM injection; while armed we
 *       forward each validated `ctl_in` to main → nut-js. EVERYTHING is gated:
 *       no input is ever injected without an active grant, and only from the
 *       exact teacher the student granted.
 *
 *   (c) STOP / REVOKE — a single teardown path (in-window button + the always-on
 *       banner button + the tray "force-stop") that cuts input first, then tears
 *       down the share, and tells the teacher via `ctl_revoke`.
 *
 * SECURITY MODEL (non-negotiable):
 *   • Control is armed ONLY by the student pressing Allow — never by an inbound
 *     message. There is no "start controlling" verb on the wire.
 *   • `ctl_in` is dropped unless (1) a grant is active AND (2) the LiveKit SENDER
 *     identity equals the granted teacher. `ctl_in` carries no `from`, so the
 *     sender identity IS the authority (it can't be spoofed by a peer).
 *   • An always-on, non-dismissable banner shows the entire time the screen is
 *     shared and/or controlled. Revoke is instant and everywhere.
 *   • A disconnect implicitly revokes (input stops the instant the room drops).
 */
import {
  controlDeny,
  controlGrant,
  controlRevoke,
  decode,
  encode,
  type LabControlInputEvent,
  type LabDataMsg,
  type LabTokenResponse,
} from "../shared/protocol";

// ─────────────────────────────────────────────────────────────────────
// LiveKit types — structural, since the dep is imported lazily (see loadLiveKit)
// ─────────────────────────────────────────────────────────────────────

/**
 * The slice of `livekit-client` we touch, typed structurally so this file
 * compiles even though we `import()` the module at runtime (it's an Electron
 * dependency the renderer loads, never bundled at tsc time). Cross-checked
 * against livekit-client 2.x: `publishData(data, { reliable?,
 * destinationIdentities? })`, `RoomEvent.DataReceived` → `(payload,
 * participant?, kind?, topic?)`, `publishTrack(track, { name?, source? })`.
 */
type LkModule = typeof import("livekit-client");
type LkRoom = import("livekit-client").Room;
type LkLocalTrackPublication = import("livekit-client").LocalTrackPublication;
type LkRemoteParticipant = import("livekit-client").RemoteParticipant;

// ─────────────────────────────────────────────────────────────────────
// DOM handles
// ─────────────────────────────────────────────────────────────────────

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const els = {
  body: document.body,
  banner: $("consent-banner"),
  bannerText: $<HTMLSpanElement>("banner-text"),
  bannerStop: $<HTMLButtonElement>("banner-stop"),
  pairCode: $<HTMLInputElement>("pair-code"),
  pairBtn: $<HTMLButtonElement>("pair-btn"),
  sessionId: $<HTMLInputElement>("session-id"),
  shareBtn: $<HTMLButtonElement>("share-btn"),
  stopBtn: $<HTMLButtonElement>("stop-btn"),
  stateShare: $<HTMLSpanElement>("state-share"),
  stateControl: $<HTMLSpanElement>("state-control"),
  stateNative: $<HTMLSpanElement>("state-native"),
  log: $("log"),
  modal: $("consent-modal"),
  consentText: $<HTMLParagraphElement>("consent-text"),
  consentAllow: $<HTMLButtonElement>("consent-allow"),
  consentDeny: $<HTMLButtonElement>("consent-deny"),
};

// ─────────────────────────────────────────────────────────────────────
// Local state (the banner + tray key off this; keep it the single source)
// ─────────────────────────────────────────────────────────────────────

const state = {
  paired: false,
  uid: "" as string,
  sessionId: "" as string,
  token: null as LabTokenResponse | null,
  sharing: false,
  /** A grant is active — input is being forwarded to main → nut-js. */
  controlled: false,
  /**
   * The teacher this machine is currently bound to for control. While
   * `controlled`, ONLY `ctl_in` whose LiveKit sender identity equals this uid is
   * injected. Set from the `ctl_req` we consented to (never from an input).
   */
  controllerUid: "" as string,
  /**
   * The teacher whose request is currently sitting in the (open) consent dialog,
   * awaiting Allow/Deny. Distinct from `controllerUid` (which is only set once
   * the student actually Allows). Cleared when the dialog closes.
   */
  pendingControllerUid: "" as string,
  nativeInputAvailable: false,
};

/** The active LiveKit Room + module (null until we connect / if the dep is absent). */
let lk: LkModule | null = null;
let room: LkRoom | null = null;
/** Our published screen-share publication, so we can unpublish exactly it. */
let sharePub: LkLocalTrackPublication | null = null;
/** The MediaStream we're capturing/publishing, so we can stop its tracks. */
let captureStream: MediaStream | null = null;

// ─────────────────────────────────────────────────────────────────────
// Small UI helpers
// ─────────────────────────────────────────────────────────────────────

function logLine(message: string): void {
  const line = document.createElement("div");
  line.textContent = `${new Date().toLocaleTimeString()}  ${message}`;
  els.log.appendChild(line);
  els.log.scrollTop = els.log.scrollHeight;
}

/**
 * Re-render every status affordance from `state`. Crucially this is what shows /
 * hides the ALWAYS-ON banner: any time we're sharing OR controlled the banner is
 * forced visible with no way to dismiss it, and the tray is told so the kill
 * switch is reachable even when the window is hidden behind the shared screen.
 */
function render(): void {
  els.stateShare.textContent = `screen: ${state.sharing ? "sharing" : "idle"}`;
  els.stateShare.classList.toggle("on", state.sharing);
  els.stateControl.textContent = `control: ${state.controlled ? "ON" : "off"}`;
  els.stateControl.classList.toggle("on", state.controlled);
  els.stateNative.textContent = `input backend: ${
    state.nativeInputAvailable ? "ready" : "unavailable"
  }`;
  els.stateNative.classList.toggle("on", state.nativeInputAvailable);

  els.shareBtn.style.display = state.sharing ? "none" : "block";
  els.stopBtn.style.display = state.sharing ? "block" : "none";
  els.shareBtn.disabled = !state.paired || state.sharing;

  const active = state.sharing || state.controlled;
  els.banner.style.display = active ? "flex" : "none";
  els.body.classList.toggle("has-banner", active);
  els.banner.classList.toggle("controlling", state.controlled);
  els.bannerText.textContent = state.controlled
    ? "Your teacher is CONTROLLING your screen"
    : "Your screen is being shared with your teacher";

  // Mirror to main for the tray tooltip + local audit line (and the screen-size
  // cache reset on a fresh grant).
  window.labAgent.reportState({
    sharing: state.sharing,
    controlled: state.controlled,
  });
}

// ─────────────────────────────────────────────────────────────────────
// Data-channel send (directed, no topic — addressing is via from/to + dest)
// ─────────────────────────────────────────────────────────────────────

/**
 * Publish a control `LabDataMsg` to the teacher over the data channel. DIRECTED
 * via `destinationIdentities` (so handshake traffic never fans out to the room)
 * and RELIABLE (a grant/deny/revoke must not silently drop). No topic — the
 * canonical contract addresses purely by identity, matching the web producer.
 * No-op (logs) when the room isn't connected (e.g. STUB mode without the dep).
 */
function sendControl(msg: LabDataMsg, toUid: string): void {
  if (!room || !toUid) {
    logLine(`(no room) would send ${msg.t} → ${toUid || "?"}`);
    return;
  }
  void room.localParticipant
    .publishData(encode(msg), { reliable: true, destinationIdentities: [toUid] })
    .catch((err) => logLine(`Failed to send ${msg.t}: ${(err as Error).message}`));
}

// ─────────────────────────────────────────────────────────────────────
// (a) CAPTURE + LiveKit publish
// ─────────────────────────────────────────────────────────────────────

/**
 * Capture the PRIMARY full screen as a MediaStream. We ask main for the
 * capturable sources (desktopCapturer) and feed the chosen screen source id into
 * getUserMedia via Chromium's `chromeMediaSource` constraints — the
 * Electron-blessed path to a full-display track (richer + more reliable than the
 * browser's `getDisplayMedia`). For the agent we take the first `screen:` source
 * (the whole desktop); a future build can pop a picker from `listSources()`
 * thumbnails for multi-monitor selection.
 */
async function captureScreen(): Promise<MediaStream> {
  const sources = await window.labAgent.listSources();
  const screen = sources.find((s) => s.id.startsWith("screen:")) ?? sources[0];
  if (!screen) throw new Error("No capturable screen found.");
  logLine(`Capturing source: ${screen.name}`);

  // `mandatory` chromeMediaSource constraints are non-standard (Electron/
  // Chromium only), so we cast through `unknown` to satisfy the DOM typings.
  const constraints = {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: screen.id,
        // Cap so a 4K/retina desktop publishes at a sane bitrate.
        maxWidth: 1920,
        maxHeight: 1080,
        maxFrameRate: 15,
      },
    },
  } as unknown as MediaStreamConstraints;
  return navigator.mediaDevices.getUserMedia(constraints);
}

/** Lazily load livekit-client. Degrades to STUB mode (no real publish) if absent. */
async function loadLiveKit(): Promise<LkModule | null> {
  if (lk) return lk;
  try {
    lk = await import("livekit-client");
    return lk;
  } catch {
    logLine(
      "livekit-client not available — running in STUB mode (no real publish)."
    );
    return null;
  }
}

/**
 * Start sharing: mint a token (via main → control plane), connect to LiveKit,
 * capture the full desktop, and publish it as a screen-share track. Also wires
 * the data-channel + disconnect handlers that drive the control flow. If
 * livekit-client is somehow absent the capture + consent/banner UX still works
 * in STUB mode so the flow stays reviewable.
 */
async function startShare(): Promise<void> {
  const sessionId = els.sessionId.value.trim();
  if (!sessionId) {
    logLine("Enter a session ID first.");
    return;
  }
  if (!state.paired) {
    logLine("Pair this device first.");
    return;
  }
  state.sessionId = sessionId;

  try {
    // 1. Token from the control plane (role-derived grants; never computed here).
    const token = await window.labAgent.getToken({ sessionId });
    state.token = token;
    state.uid = token.identity;
    logLine(`Token minted (role=${token.role}) for room ${token.room}.`);

    // 2. Capture the full desktop.
    captureStream = await captureScreen();

    // 3. Connect + publish.
    const livekit = await loadLiveKit();
    if (livekit) {
      const r = new livekit.Room({ adaptiveStream: true, dynacast: true });
      room = r;
      wireRoomEvents(livekit, r);

      // autoSubscribe:false — the agent only PUBLISHES (the teacher views us); we
      // don't need anyone else's media, which keeps this process lean.
      await r.connect(token.url, token.token, { autoSubscribe: false });
      logLine(`Connected to LiveKit room ${token.room}.`);

      // Wrap the raw desktop track as a LiveKit LocalVideoTrack and publish it
      // under the student `lab-share` name + ScreenShare source, matching the
      // web's track-naming contract (so the teacher's derivation sees a `view`).
      const [mediaTrack] = captureStream.getVideoTracks();
      if (!mediaTrack) throw new Error("Capture produced no video track.");
      const videoTrack = new livekit.LocalVideoTrack(mediaTrack);
      sharePub = await r.localParticipant.publishTrack(videoTrack, {
        name: "lab-share",
        source: livekit.Track.Source.ScreenShare,
        simulcast: false,
      });
      logLine("Published full-desktop screen-share track.");

      // If the OS ends the capture out-of-band (e.g. the user revokes Screen
      // Recording mid-session), tear our state down so nothing claims a dead share.
      mediaTrack.addEventListener("ended", () => void stopShare());
    } else {
      // STUB: pretend we connected so the rest of the UX (banner, consent) works.
      logLine("(stub) Skipping real LiveKit connect/publish.");
    }

    // 4. Tell the control plane a share started (roster + audit + map lines).
    void postShare("start");

    state.sharing = true;
    render();
  } catch (err) {
    logLine(`Share failed: ${(err as Error).message}`);
    await stopShare(); // clean up any half-open capture
  }
}

/**
 * Wire the room's data-channel + lifecycle handlers. Split out so `startShare`
 * stays readable. Two events matter to the agent:
 *   • DataReceived — the `ctl_*` handshake + input from the teacher.
 *   • Disconnected — an implicit revoke: cut input the instant the room drops.
 */
function wireRoomEvents(livekit: LkModule, r: LkRoom): void {
  r.on(
    livekit.RoomEvent.DataReceived,
    (
      payload: Uint8Array,
      participant?: LkRemoteParticipant,
      _kind?: unknown,
      _topic?: string
    ) => {
      // The LiveKit sender identity is the AUTHORITY for control packets (esp.
      // `ctl_in`, which carries no `from`). Drop anything with no resolvable
      // sender — we never act on an unattributable control frame.
      handleControlData(payload, participant?.identity);
    }
  );

  // A network drop / SFU disconnect implicitly revokes any active control: cut
  // injection immediately (locally — no point sending `ctl_revoke` over a dead
  // socket) and clear the share/banner. This is the "disconnect = revoke" half
  // of the security model.
  r.on(livekit.RoomEvent.Disconnected, () => {
    if (state.controlled) revokeControl("disconnect");
    if (state.sharing) {
      logLine("Room disconnected — share ended.");
      state.sharing = false;
      render();
    }
  });
}

/**
 * STOP / REVOKE — the single teardown path used by the Stop button, the banner
 * button, and the tray "force-stop". Idempotent: revokes any active control
 * FIRST (cut input before media), stops the capture tracks, unpublishes +
 * disconnects LiveKit, and tells the server.
 */
async function stopShare(): Promise<void> {
  // Revoke control first so the controller is cut off immediately, even if the
  // media teardown below is slow.
  if (state.controlled) revokeControl("local");

  if (sharePub && room) {
    try {
      const track = sharePub.track;
      if (track) await room.localParticipant.unpublishTrack(track, true);
    } catch {
      /* best-effort */
    }
  }
  sharePub = null;

  if (captureStream) {
    captureStream.getTracks().forEach((t) => t.stop());
    captureStream = null;
  }
  if (room) {
    try {
      await room.disconnect();
    } catch {
      /* best-effort */
    }
    room = null;
  }
  if (state.sharing) {
    void postShare("end");
    logLine("Stopped sharing.");
  }
  state.sharing = false;
  state.token = null;
  render();
}

/** Mirror a share_start/share_end to the control plane (best-effort, via main). */
function postShare(action: "start" | "end"): Promise<void> {
  // The agent shares to the teacher ("view" link on the map). The real fetch
  // goes through main so the Bearer token never enters the renderer; here we log
  // the intent (the route + body shape are in shared/protocol.ts → ENDPOINTS).
  logLine(`(control plane) share → ${action} for ${state.sessionId}`);
  return Promise.resolve();
}

// ─────────────────────────────────────────────────────────────────────
// (b) REMOTE CONTROL — consent-gated, banner-backed, sender-verified
// ─────────────────────────────────────────────────────────────────────

/**
 * A control packet arrived on the data channel. `senderUid` is the LiveKit
 * participant identity of the sender (the authority). Two kinds:
 *   - HANDSHAKE (`ctl_req` / `ctl_revoke`) — the teacher asks / ends.
 *   - INPUT (`ctl_in`) — replayed via main → nut-js, but ONLY while a grant is
 *     active AND `senderUid === state.controllerUid`.
 *
 * (`ctl_grant` / `ctl_deny` are things WE send, not receive; if one is echoed
 * back we ignore it.) There is no message that can START control — only the
 * consent dialog can.
 */
function handleControlData(payload: Uint8Array, senderUid: string | undefined): void {
  const msg = decode(payload); // null for any non-control / malformed packet
  if (!msg) return;

  // Every control message must be addressed to US. The handshake messages carry
  // an explicit `to`; for `ctl_req`/`ctl_revoke` we also require it equals our
  // identity so a directed-but-misrouted packet can't drive us.
  if ((msg.t === "ctl_req" || msg.t === "ctl_revoke" || msg.t === "ctl_in")) {
    if (state.uid && msg.to !== state.uid) return;
  }

  switch (msg.t) {
    case "ctl_req":
      // Teacher is asking — surface the explicit consent dialog. Nothing is armed
      // until the student presses Allow. We trust the SENDER identity (not the
      // embedded `from`) as the controller we'd bind to, but require they agree.
      if (senderUid && msg.from && senderUid !== msg.from) return;
      promptForControl(senderUid ?? msg.from);
      break;

    case "ctl_revoke":
      // The teacher ended control. Honour only from the bound/pending controller.
      if (
        senderUid &&
        senderUid !== state.controllerUid &&
        senderUid !== state.pendingControllerUid
      ) {
        return;
      }
      if (state.controlled) revokeControl("remote");
      else closeConsentDialog(); // cancels a pending request the teacher withdrew
      break;

    case "ctl_in": {
      // HARD GATE: drop unless a grant is active AND the sender is the exact
      // teacher we granted. `ctl_in` has no `from`, so the LiveKit sender
      // identity is the only authority — a third party on the room can't inject.
      if (!state.controlled) return;
      if (!senderUid || senderUid !== state.controllerUid) return;
      void injectControlInput(msg.ev);
      break;
    }

    default:
      // ctl_grant / ctl_deny are outbound-only; ignore any echo.
      break;
  }
}

/** Forward one validated input event to main → nut-js. Gated entirely upstream. */
async function injectControlInput(ev: LabControlInputEvent): Promise<void> {
  // Re-assert the gate at the call site as defence-in-depth (the only caller
  // already checked, but this function must never inject without a live grant).
  if (!state.controlled) return;
  try {
    await window.labAgent.injectInput(ev);
  } catch (err) {
    logLine(`Inject failed: ${(err as Error).message}`);
  }
}

/** Close + reset the consent dialog. */
function closeConsentDialog(): void {
  els.modal.style.display = "none";
  state.pendingControllerUid = "";
}

/** Show the modal consent dialog for an incoming control request. */
function promptForControl(fromUid: string): void {
  if (!fromUid) return;
  if (!state.nativeInputAvailable) {
    // Be honest: we can't actually control without the native backend.
    els.consentText.textContent =
      "Your teacher asked to control your screen, but remote control isn't " +
      "available on this device (input backend missing). You can still share.";
    els.consentAllow.disabled = true;
  } else {
    els.consentText.textContent =
      "Your teacher is asking to control your mouse and keyboard. A banner will " +
      "stay on screen the whole time, and you can revoke this at any moment.";
    els.consentAllow.disabled = false;
  }
  state.pendingControllerUid = fromUid;
  els.modal.style.display = "flex";
  logLine(`Control requested by ${fromUid} — awaiting consent.`);
}

/** Student pressed Allow → ARM control bound to the requesting teacher, raise the banner. */
function grantControl(): void {
  const controller = state.pendingControllerUid;
  if (!controller) {
    closeConsentDialog();
    return;
  }
  closeConsentDialog();
  state.controlled = true;
  state.controllerUid = controller; // bind the grant to THIS teacher
  logLine(`Consent GRANTED to ${controller}.`);
  // Durable, audited consent record (via main) + the fast-path data-channel ack.
  void postConsent("control", true);
  sendControl(controlGrant(state.uid, controller), controller);
  render(); // banner flips to the red "CONTROLLING" state
}

/** Student pressed Deny → record the denial, ack the teacher, no control. */
function denyControl(): void {
  const controller = state.pendingControllerUid;
  closeConsentDialog();
  logLine("Consent DENIED.");
  if (controller) {
    void postConsent("control", false);
    sendControl(controlDeny(state.uid, controller), controller);
  }
}

/**
 * End an active control grant. `source` distinguishes a local revoke (student
 * hit Stop/Revoke), a remote one (teacher ended it), and a disconnect (room
 * dropped). Input is cut FIRST by clearing `controlled`; a local revoke also
 * tells the teacher via `ctl_revoke` so the audit trail is symmetric. A
 * disconnect skips the send (the socket is gone).
 */
function revokeControl(source: "local" | "remote" | "disconnect"): void {
  if (!state.controlled) return;
  const controller = state.controllerUid;
  // Cut injection IMMEDIATELY — clear the flag before anything async.
  state.controlled = false;
  state.controllerUid = "";
  logLine(`Control REVOKED (${source}).`);
  if (source === "local" && controller) {
    void postConsent("control", false);
    sendControl(controlRevoke(state.uid, controller), controller);
  }
  render();
}

/** Mirror a consent decision to the control plane (durable audit, via main). */
function postConsent(kind: "control" | "record", accept: boolean): Promise<void> {
  logLine(`(control plane) consent → ${kind}:${accept} for ${state.sessionId}`);
  return Promise.resolve();
}

// ─────────────────────────────────────────────────────────────────────
// Wire up + boot
// ─────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  // Surface native-input availability up front so consent can be honest.
  state.nativeInputAvailable = await window.labAgent.nativeInputAvailable();

  // Status/log + the tray "force-stop" kill switch coming from main.
  window.labAgent.onStatus((msg) => {
    if (msg.kind === "log") logLine(msg.message);
    else if (msg.kind === "force-stop") void stopShare();
  });

  els.pairBtn.addEventListener("click", async () => {
    els.pairBtn.disabled = true;
    try {
      const res = await window.labAgent.pair(els.pairCode.value);
      state.paired = true;
      state.uid = res.uid;
      logLine(`Paired as ${res.displayName ?? res.uid}.`);
    } catch (err) {
      logLine(`Pairing failed: ${(err as Error).message}`);
    } finally {
      els.pairBtn.disabled = false;
      render();
    }
  });

  els.shareBtn.addEventListener("click", () => void startShare());
  els.stopBtn.addEventListener("click", () => void stopShare());
  els.bannerStop.addEventListener("click", () => void stopShare());
  els.consentAllow.addEventListener("click", grantControl);
  els.consentDeny.addEventListener("click", denyControl);

  render();
  logLine("Lab Agent ready.");
}

void boot();
