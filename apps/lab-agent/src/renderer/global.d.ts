/**
 * Ambient declaration so the renderer TypeScript knows about the `window
 * .labAgent` surface the preload bridge injects. Mirrors `LabAgentApi` in
 * src/preload.ts (kept as a type-only import so this file emits nothing).
 */
import type { LabAgentApi } from "../preload";

declare global {
  interface Window {
    labAgent: LabAgentApi;
  }
}

export {};
