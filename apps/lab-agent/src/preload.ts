/**
 * Preload bridge — the ONLY code that may touch `ipcRenderer`.
 *
 * Runs in an isolated context between the privileged main process and the
 * sandboxed renderer. It exposes a small, explicit, typed `window.labAgent`
 * surface via `contextBridge` so the renderer can do exactly the operations in
 * src/shared/protocol.ts → IPC and nothing more. No Node, no `require`, no raw
 * IPC reaches the page.
 */
import { contextBridge, ipcRenderer } from "electron";
import {
  CaptureSource,
  IPC,
  LabControlInputEvent,
  LabTokenRequest,
  LabTokenResponse,
  PairResult,
} from "./shared/protocol";

/** A status/log message pushed from main → renderer. */
export type StatusMessage =
  | { kind: "log"; message: string }
  | { kind: "force-stop" };

/**
 * The typed API the renderer sees as `window.labAgent`. Each method maps onto
 * exactly one IPC channel; there is no general-purpose `invoke`, so the page
 * can't reach an arbitrary main-process handler.
 */
export interface LabAgentApi {
  /** Pair this device from the one-time code shown in the web app. */
  pair(code: string): Promise<PairResult>;
  /** Mint a LiveKit access token for a session (via the control plane). */
  getToken(req: LabTokenRequest): Promise<LabTokenResponse>;
  /** List capturable screens/windows for the share picker. */
  listSources(): Promise<CaptureSource[]>;
  /**
   * Inject one normalized remote-control input (honoured only while a consent
   * grant is active AND the inbound packet's sender identity matched the granted
   * teacher — the renderer enforces both before calling this).
   */
  injectInput(ev: LabControlInputEvent): Promise<void>;
  /** Whether the native input backend is available (remote control possible). */
  nativeInputAvailable(): Promise<boolean>;
  /** Tell main the local sharing/control state changed (tray + local audit). */
  reportState(state: { sharing: boolean; controlled: boolean }): void;
  /** Bring the agent window to the front (e.g. when a control request arrives). */
  focusWindow(): void;
  /** Subscribe to status/log/force-stop messages from main. Returns unsubscribe. */
  onStatus(handler: (msg: StatusMessage) => void): () => void;
}

const api: LabAgentApi = {
  pair: (code) => ipcRenderer.invoke(IPC.pair, code),
  getToken: (req) => ipcRenderer.invoke(IPC.getToken, req),
  listSources: () => ipcRenderer.invoke(IPC.listSources),
  injectInput: (ev) => ipcRenderer.invoke(IPC.injectInput, ev),
  nativeInputAvailable: () => ipcRenderer.invoke(IPC.nativeStatus),
  reportState: (state) => ipcRenderer.send(IPC.consentChanged, state),
  focusWindow: () => ipcRenderer.send(IPC.focusWindow),
  onStatus: (handler) => {
    const listener = (_e: unknown, msg: StatusMessage) => handler(msg);
    ipcRenderer.on(IPC.status, listener);
    return () => ipcRenderer.removeListener(IPC.status, listener);
  },
};

contextBridge.exposeInMainWorld("labAgent", api);
