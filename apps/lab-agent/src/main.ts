/**
 * Electron MAIN process for the Virtual Lab desktop agent.
 *
 * Responsibilities (and ONLY these — keep the renderer sandboxed):
 *   - own the single app window + a system-tray menu (so the agent can live in
 *     the menu bar / notification area while a session runs),
 *   - expose a small, audited IPC surface to the renderer (see src/shared
 *     /protocol.ts → IPC) for: device pairing, LiveKit-token mint, listing
 *     capturable screens, and the privileged native input injection,
 *   - resolve a Firebase ID token (device pairing) and call the SAME control
 *     plane (`POST /api/lab/sessions/[id]/token`) the web/mobile apps use — the
 *     agent never holds a LiveKit secret.
 *
 * The renderer (capture + LiveKit + consent UI) runs with `contextIsolation`
 * on and `nodeIntegration` OFF; it can only reach main through the typed
 * preload bridge. Native input (nut-js) is loaded HERE, lazily, never in the
 * renderer, so the dangerous capability has exactly one choke point.
 */
import {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  Tray,
} from "electron";
import * as path from "path";
import {
  API_URL,
  CaptureSource,
  ENDPOINTS,
  IPC,
  LabControlInputEvent,
  LabTokenRequest,
  LabTokenResponse,
  PairResult,
} from "./shared/protocol";

// ─────────────────────────────────────────────────────────────────────
// App state
// ─────────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

/**
 * The Bearer token + identity from the most recent successful pairing. Held in
 * the main process (never handed to the renderer wholesale) so the renderer
 * can't exfiltrate it; the renderer asks main to *use* it via IPC instead.
 */
let auth: PairResult | null = null;

/**
 * Lazily-loaded native input backend (nut-js, `@nut-tree-fork/nut-js`). OPTIONAL
 * dependency: if it isn't installed or fails to load (e.g. no native rebuild for
 * this Electron ABI), remote control is simply unavailable and screen-sharing
 * still works. We never crash the agent over it.
 *
 * The shapes below are a HAND-WRITTEN slice of the real nut-js 4.2 surface (we
 * `require` it at runtime rather than `import` it, so it's typed structurally
 * here). `nut-js` exposes singleton `mouse` / `keyboard` / `screen` instances, a
 * `Point` class, and the `Button` / `Key` enums. Cross-checked against
 * `node_modules/@nut-tree-fork/nut-js` so the calls below match exactly:
 *   - `mouse.setPosition(Point)` (instant move; `Point` is `{x,y}`),
 *   - `mouse.leftClick()` / `rightClick()`, `pressButton(Button)` /
 *     `releaseButton(Button)` (Button = LEFT|MIDDLE|RIGHT),
 *   - `mouse.scrollUp/Down/Left/Right(steps)`,
 *   - `keyboard.pressKey(...Key)` / `releaseKey(...Key)` / `type(...string)`,
 *   - `screen.width()` / `screen.height()` (Promise<number>, physical pixels).
 */
/** nut-js mouse Button enum (numeric). LEFT=0, MIDDLE=1, RIGHT=2. */
type NutButton = number;
/** nut-js Key enum (numeric); we resolve members by NAME off `nut.Key`. */
type NutKey = number;
type NutPoint = { x: number; y: number };
type NutKeyboard = {
  type: (...input: string[]) => Promise<unknown>;
  pressKey: (...keys: NutKey[]) => Promise<unknown>;
  releaseKey: (...keys: NutKey[]) => Promise<unknown>;
  config: { autoDelayMs: number };
};
type NutMouse = {
  setPosition: (target: NutPoint) => Promise<unknown>;
  leftClick: () => Promise<unknown>;
  rightClick: () => Promise<unknown>;
  pressButton: (btn: NutButton) => Promise<unknown>;
  releaseButton: (btn: NutButton) => Promise<unknown>;
  scrollUp: (amount: number) => Promise<unknown>;
  scrollDown: (amount: number) => Promise<unknown>;
  scrollLeft: (amount: number) => Promise<unknown>;
  scrollRight: (amount: number) => Promise<unknown>;
  config: { autoDelayMs: number; mouseSpeed: number };
};
type NutModule = {
  mouse: NutMouse;
  keyboard: NutKeyboard;
  /** Button enum: { LEFT:0, MIDDLE:1, RIGHT:2 }. */
  Button: Record<string, NutButton>;
  /** Key enum keyed by name (e.g. Key.KeyA, Key.Enter) → numeric value. */
  Key: Record<string, NutKey>;
  Point: new (x: number, y: number) => NutPoint;
  screen: { width: () => Promise<number>; height: () => Promise<number> };
};

let nut: NutModule | null = null;
let nativeInputAvailable = false;

/**
 * Cached physical screen size (nut-js `screen.width()/height()`), refreshed
 * lazily. Normalized pointer coordinates (0..1) are multiplied by this to land
 * on a physical pixel. Re-read on the first move after a grant begins so a
 * resolution / display change between sessions is picked up, but cached within a
 * session so we don't `await` two IPC-free-but-still-async calls on every cursor
 * sample (which arrive at pointer-move frequency).
 */
let screenSize: { w: number; h: number } | null = null;

function loadNativeInput(): void {
  try {
    // Resolved at runtime so a missing optional dep is a soft failure, not a
    // bundler/`tsc` error. The package name matches optionalDependencies in
    // package.json.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    nut = require("@nut-tree-fork/nut-js") as NutModule;
    nativeInputAvailable = true;
    log("Native input backend (nut-js) loaded — remote control available.");
  } catch (err) {
    nut = null;
    nativeInputAvailable = false;
    log(
      "Native input backend (nut-js) not available — remote control disabled. " +
        "Install + native-rebuild it to enable (see README). " +
        `(${(err as Error).message})`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────
// Window + tray
// ─────────────────────────────────────────────────────────────────────

/**
 * The app/tray icon, loaded from dist/icon.png (copied from build/icon.png at
 * build time, and bundled via build.files = dist/**). Falls back to an empty
 * image so a missing icon never crashes the tray — notably on Windows, where the
 * tray would otherwise appear blank.
 */
function appIcon() {
  try {
    const img = nativeImage.createFromPath(path.join(__dirname, "icon.png"));
    return img.isEmpty() ? nativeImage.createEmpty() : img;
  } catch {
    return nativeImage.createEmpty();
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 460,
    height: 640,
    resizable: false,
    title: "PlacementRanker Lab Agent",
    icon: appIcon(),
    webPreferences: {
      // Hard sandbox: the renderer gets NO Node, NO remote module, and can only
      // reach main through the preload bridge below.
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload needs `require('electron')`; renderer stays isolated
    },
  });

  // dist/renderer/index.html is copied next to the compiled JS at build time
  // (scripts/copy-renderer.js), so this path is correct in both dev and a
  // packaged app.
  void mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  // Open external links (e.g. "open the web app") in the user's real browser,
  // never inside this privileged window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray(): void {
  // Resize the app icon (dist/icon.png) for the menu-bar / notification-area
  // slot. A real icon is what makes the tray visible on Windows — the
  // "Stop sharing / Revoke control" kill switch lives here.
  const full = appIcon();
  const icon = full.isEmpty() ? full : full.resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("PlacementRanker Lab Agent");
  const menu = Menu.buildFromTemplate([
    {
      label: "Open Lab Agent",
      click: () => {
        if (mainWindow) mainWindow.show();
        else createWindow();
      },
    },
    { type: "separator" },
    // Mirrors the renderer's "Stop sharing / Revoke control" — a kill switch
    // that's reachable even if the window is hidden behind a shared screen.
    {
      label: "Stop sharing / Revoke control",
      click: () => sendToRenderer(IPC.status, { kind: "force-stop" }),
    },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

// ─────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────

/** Push a status/log line to the renderer (best-effort; ignored if no window). */
function sendToRenderer(channel: string, payload: unknown): void {
  mainWindow?.webContents.send(channel, payload);
}

/** Log to the agent's console AND mirror into the window's status pane. */
function log(message: string): void {
  // eslint-disable-next-line no-console
  console.log(`[lab-agent] ${message}`);
  sendToRenderer(IPC.status, { kind: "log", message });
}

// ─────────────────────────────────────────────────────────────────────
// Pairing + token (control plane) — STUBBED for the scaffold
// ─────────────────────────────────────────────────────────────────────

/**
 * Resolve a Firebase ID token from a one-time pairing code.
 *
 * REAL FLOW (Phase 5): POST the code to a web-app pairing route, get back a
 * Firebase custom token, exchange it via the Firebase Auth REST API for an ID
 * token, return that + the uid. The agent then sends the ID token as
 * `Authorization: Bearer` on every control-plane call.
 *
 * STUB: we don't have the pairing route yet, so we accept any non-empty code
 * and return a placeholder token/uid. This keeps the whole IPC + UI flow
 * exercisable end-to-end without a live backend. The shape returned is the real
 * `PairResult`, so swapping in the real fetch later touches only this function.
 */
async function resolveAuthToken(pairingCode: string): Promise<PairResult> {
  const code = pairingCode.trim();
  if (!code) throw new Error("Enter the pairing code shown in the web app.");

  // ── STUB START — replace with the real pairing exchange ──────────────
  // Example of the real call (left commented so the contract is visible):
  //
  //   const res = await fetch(`${API_URL}/api/lab/agent/pair`, {
  //     method: "POST",
  //     headers: { "Content-Type": "application/json" },
  //     body: JSON.stringify({ code }),
  //   });
  //   if (!res.ok) throw new Error(`Pairing failed (${res.status})`);
  //   const { customToken, uid, displayName } = await res.json();
  //   const idToken = await exchangeCustomTokenForIdToken(customToken);
  //   return { idToken, uid, displayName };
  //
  log(`(stub) Pairing with code "${code}" against ${API_URL}`);
  const result: PairResult = {
    idToken: `stub-id-token-for-${code}`,
    uid: `stub-uid-${code}`,
    displayName: "Paired Device",
  };
  // ── STUB END ─────────────────────────────────────────────────────────

  auth = result;
  return result;
}

/**
 * Mint a LiveKit access token for a session by calling the control plane with
 * the paired Bearer token. This is the EXACT same route the web + mobile apps
 * use (`POST /api/lab/sessions/[id]/token`); the server re-resolves the role
 * and bakes the grants in. The agent never computes grants itself.
 *
 * The network call is real (so wiring is correct), but with the stub token it
 * will 401 against a live server — caught and surfaced as a status line. Once
 * `resolveAuthToken` returns a real ID token this works as-is.
 */
async function mintLiveKitToken(
  req: LabTokenRequest
): Promise<LabTokenResponse> {
  if (!auth) throw new Error("Not paired yet — pair the device first.");
  const res = await fetch(`${API_URL}${ENDPOINTS.token(req.sessionId)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth.idToken}`,
    },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Token mint failed (${res.status})`);
  }
  return (await res.json()) as LabTokenResponse;
}

// ─────────────────────────────────────────────────────────────────────
// Native input injection (the privileged capability) — real nut-js mapping
// ─────────────────────────────────────────────────────────────────────

/**
 * DOM `KeyboardEvent.code` → nut-js `Key` ENUM-MEMBER NAME. The web sends the
 * physical `code` (layout-stable), which we translate to the name we look up on
 * `nut.Key[...]` at call time (so a nut-js enum re-number can't break us). Only
 * codes present in nut-js's `Key` enum are mapped; an unmapped code falls back to
 * typing the event's `key` character (see `injectKey`). Digit/letter rows, the
 * function keys, navigation, editing, numpad, and every modifier are covered.
 */
const CODE_TO_NUT_KEY: Record<string, string> = {
  // Letters (KeyA → "A", matching nut-js's Key.A naming).
  KeyA: "A", KeyB: "B", KeyC: "C", KeyD: "D", KeyE: "E", KeyF: "F",
  KeyG: "G", KeyH: "H", KeyI: "I", KeyJ: "J", KeyK: "K", KeyL: "L",
  KeyM: "M", KeyN: "N", KeyO: "O", KeyP: "P", KeyQ: "Q", KeyR: "R",
  KeyS: "S", KeyT: "T", KeyU: "U", KeyV: "V", KeyW: "W", KeyX: "X",
  KeyY: "Y", KeyZ: "Z",
  // Number row (Digit1 → "Num1").
  Digit0: "Num0", Digit1: "Num1", Digit2: "Num2", Digit3: "Num3",
  Digit4: "Num4", Digit5: "Num5", Digit6: "Num6", Digit7: "Num7",
  Digit8: "Num8", Digit9: "Num9",
  // Whitespace / editing.
  Enter: "Enter", NumpadEnter: "Enter", Tab: "Tab", Space: "Space",
  Backspace: "Backspace", Delete: "Delete", Escape: "Escape", Insert: "Insert",
  // Punctuation.
  Minus: "Minus", Equal: "Equal", BracketLeft: "LeftBracket",
  BracketRight: "RightBracket", Backslash: "Backslash", Semicolon: "Semicolon",
  Quote: "Quote", Backquote: "Grave", Comma: "Comma", Period: "Period",
  Slash: "Slash",
  // Navigation.
  ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
  Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
  // Modifiers (left/right distinct, mapped to nut-js's named members).
  ShiftLeft: "LeftShift", ShiftRight: "RightShift",
  ControlLeft: "LeftControl", ControlRight: "RightControl",
  AltLeft: "LeftAlt", AltRight: "RightAlt",
  MetaLeft: "LeftSuper", MetaRight: "RightSuper",
  CapsLock: "CapsLock",
  // Function row.
  F1: "F1", F2: "F2", F3: "F3", F4: "F4", F5: "F5", F6: "F6",
  F7: "F7", F8: "F8", F9: "F9", F10: "F10", F11: "F11", F12: "F12",
  // Numpad.
  Numpad0: "NumPad0", Numpad1: "NumPad1", Numpad2: "NumPad2",
  Numpad3: "NumPad3", Numpad4: "NumPad4", Numpad5: "NumPad5",
  Numpad6: "NumPad6", Numpad7: "NumPad7", Numpad8: "NumPad8",
  Numpad9: "NumPad9", NumpadAdd: "Add", NumpadSubtract: "Subtract",
  NumpadMultiply: "Multiply", NumpadDivide: "Divide", NumpadDecimal: "Decimal",
};

/** nut-js modifier `Key` member names, in natural (modifiers-first) order. */
const MOD_KEY_NAMES = {
  ctrl: "LeftControl",
  alt: "LeftAlt",
  shift: "LeftShift",
  meta: "LeftSuper",
} as const;

/** Resolve a nut-js `Key` by enum-member name, or null if this build lacks it. */
function nutKey(name: string | undefined): number | null {
  if (!nut || !name) return null;
  const v = nut.Key[name];
  return typeof v === "number" ? v : null;
}

/** Map a DOM `MouseEvent.button` index → nut-js `Button`. Defaults to LEFT. */
function nutButton(button: number | undefined): number {
  if (!nut) return 0;
  if (button === 2) return nut.Button.RIGHT;
  if (button === 1) return nut.Button.MIDDLE;
  return nut.Button.LEFT;
}

/** Lazily read + cache the physical screen size for coordinate mapping. */
async function ensureScreenSize(): Promise<{ w: number; h: number }> {
  if (screenSize) return screenSize;
  const w = await nut!.screen.width();
  const h = await nut!.screen.height();
  screenSize = { w: Math.max(1, w), h: Math.max(1, h) };
  return screenSize;
}

/** Translate a normalized pointer `button` action into a nut-js press/release/click. */
async function injectPointer(ev: {
  action: "move" | "down" | "up";
  x: number;
  y: number;
  button?: number;
}): Promise<void> {
  const n = nut!;
  // Always position first so a down/up lands where the teacher aimed (the web
  // sends the coordinates with every pointer event, move or button).
  const { w, h } = await ensureScreenSize();
  await n.mouse.setPosition(
    new n.Point(Math.round(ev.x * (w - 1)), Math.round(ev.y * (h - 1)))
  );
  if (ev.action === "down") {
    await n.mouse.pressButton(nutButton(ev.button));
  } else if (ev.action === "up") {
    await n.mouse.releaseButton(nutButton(ev.button));
  }
  // `move` is the position-only case handled above.
}

/** Translate wheel deltas into nut-js scroll "steps" (sign-split per axis). */
async function injectScroll(ev: { dx: number; dy: number }): Promise<void> {
  const n = nut!;
  // DOM wheel deltas are pixels-ish and can be large; nut-js scrolls in coarse
  // "steps". Convert to a small step count so one notch ≈ one step, and split by
  // sign so we call the correct directional method.
  const steps = (delta: number) => Math.min(10, Math.max(1, Math.round(Math.abs(delta) / 50)));
  if (ev.dy < 0) await n.mouse.scrollUp(steps(ev.dy));
  else if (ev.dy > 0) await n.mouse.scrollDown(steps(ev.dy));
  if (ev.dx < 0) await n.mouse.scrollLeft(steps(ev.dx));
  else if (ev.dx > 0) await n.mouse.scrollRight(steps(ev.dx));
}

/**
 * Translate a key event. We hold modifiers around the keypress so combos
 * (Ctrl+C, Cmd+Tab) work. Preference order for the main key:
 *   1. the physical `code` mapped via {@link CODE_TO_NUT_KEY} (layout-stable),
 *   2. else, for a single printable character on `down`, `keyboard.type(char)`
 *      so unmapped/locale glyphs still arrive.
 * Modifier-only events (the `code` IS a modifier) just press/release that
 * modifier and skip the printable fallback.
 */
async function injectKey(ev: {
  action: "down" | "up";
  key: string;
  code: string;
  mods?: { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean };
}): Promise<void> {
  const n = nut!;
  const mappedName = CODE_TO_NUT_KEY[ev.code];
  const mainKey = nutKey(mappedName);
  const isModifierCode = mappedName ? Object.values(MOD_KEY_NAMES).includes(
    mappedName as (typeof MOD_KEY_NAMES)[keyof typeof MOD_KEY_NAMES]
  ) : false;

  // Active modifier Keys to hold around the press (skip the one that IS this
  // key, so a Shift keydown doesn't try to wrap itself).
  const heldMods: number[] = [];
  if (ev.mods && !isModifierCode) {
    for (const [flag, name] of Object.entries(MOD_KEY_NAMES) as [
      keyof typeof MOD_KEY_NAMES,
      string
    ][]) {
      if (ev.mods[flag]) {
        const k = nutKey(name);
        if (k !== null) heldMods.push(k);
      }
    }
  }

  if (ev.action === "down") {
    for (const m of heldMods) await n.keyboard.pressKey(m);
    if (mainKey !== null) {
      await n.keyboard.pressKey(mainKey);
    } else if (!isModifierCode && ev.key.length === 1 && heldMods.length === 0) {
      // Unmapped printable with no active modifiers → type the literal char so
      // locale glyphs / symbols still land. (With modifiers held we can't type a
      // char meaningfully, so we no-op rather than send the wrong thing.)
      await n.keyboard.type(ev.key);
    }
  } else {
    // key up: release the main key, then the modifiers (reverse of press).
    if (mainKey !== null) await n.keyboard.releaseKey(mainKey);
    for (const m of heldMods.reverse()) await n.keyboard.releaseKey(m);
  }
}

/**
 * Inject ONE normalized remote-control input via the native backend.
 *
 * Called from IPC ONLY while a consent grant is active: the renderer gates every
 * `ctl_in` on `state.controlled` AND verifies the LiveKit sender identity equals
 * the granted teacher before it ever reaches this channel; main additionally
 * refuses to inject when the backend is absent. There is intentionally no
 * "start control" side effect here — this function can only move/click/type.
 *
 * SECURITY: this performs no consent check of its own beyond "is the backend
 * loaded" — consent + sender-identity binding are enforced upstream (renderer +
 * the data-channel handshake). It must never be reachable except via the audited
 * IPC channel. Every nut-js call is wrapped so a single bad event (e.g. an
 * unmapped key on an exotic layout) can never crash the agent and drop the grant.
 */
async function injectInput(ev: LabControlInputEvent): Promise<void> {
  if (!nut || !nativeInputAvailable) {
    log(`(ignored) input "${ev.kind}" — native backend unavailable.`);
    return;
  }
  try {
    if (ev.kind === "pointer") {
      await injectPointer(ev);
    } else if (ev.kind === "scroll") {
      await injectScroll(ev);
    } else {
      await injectKey(ev);
    }
  } catch (err) {
    // Soft-fail a single event: log and keep the grant alive. A thrown injection
    // (transient OS hiccup, unmapped key) must not tear down control.
    log(`Input injection failed (${ev.kind}): ${(err as Error).message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────
// IPC wiring (the renderer's only door into main)
// ─────────────────────────────────────────────────────────────────────

function registerIpc(): void {
  // Pair the device from a one-time code → resolve a Bearer token.
  ipcMain.handle(IPC.pair, async (_e, code: string): Promise<PairResult> => {
    const result = await resolveAuthToken(code);
    // Hand the renderer only what it needs to render (uid + name), never the
    // raw token — the token stays in main and is attached server-side here.
    return { idToken: "", uid: result.uid, displayName: result.displayName };
  });

  // Mint a LiveKit token for a session.
  ipcMain.handle(
    IPC.getToken,
    (_e, req: LabTokenRequest): Promise<LabTokenResponse> =>
      mintLiveKitToken(req)
  );

  // Enumerate capturable screens/windows for the picker.
  ipcMain.handle(IPC.listSources, async (): Promise<CaptureSource[]> => {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 320, height: 200 },
    });
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnailDataUrl: s.thumbnail.toDataURL(),
    }));
  });

  // Inject a single remote-control input (privileged — see injectInput notes).
  ipcMain.handle(
    IPC.injectInput,
    (_e, ev: LabControlInputEvent): Promise<void> => injectInput(ev)
  );

  // Report native-input availability so the renderer can disable/explain
  // remote control up front.
  ipcMain.handle(IPC.nativeStatus, (): boolean => nativeInputAvailable);

  // Consent changes from the renderer — reflected in the tray tooltip + logged
  // for the local audit (the durable audit lives server-side via /consent).
  ipcMain.on(
    IPC.consentChanged,
    (_e, state: { controlled: boolean; sharing: boolean }) => {
      // A grant just (re)armed → drop the cached screen size so the FIRST pointer
      // event of this session re-reads the real resolution (handles a monitor /
      // display change between sessions). Cleared on revoke too, harmlessly.
      if (state.controlled) screenSize = null;
      const bits = [
        state.sharing ? "sharing" : null,
        state.controlled ? "being controlled" : null,
      ].filter(Boolean);
      tray?.setToolTip(
        bits.length
          ? `Lab Agent — ${bits.join(" + ")}`
          : "PlacementRanker Lab Agent"
      );
      log(`Local state: ${bits.length ? bits.join(", ") : "idle"}`);
    }
  );
}

// ─────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────

// Single-instance: a second launch focuses the existing window instead of
// opening a second agent that could double-inject input.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  void app.whenReady().then(() => {
    loadNativeInput();
    registerIpc();
    createWindow();
    createTray();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  // Keep running in the tray when all windows close (so a hidden share keeps
  // going); the user quits explicitly from the tray menu.
  app.on("window-all-closed", () => {
    // Intentionally NOT quitting on non-macOS here — the tray is the home base.
  });
}
