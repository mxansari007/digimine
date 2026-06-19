// Browser shims for the Node globals that bundled deps (livekit-client + its
// transitive deps) reference at LOAD time. esbuild's `--platform=browser` does
// NOT define `process`, so without this the bundle throws "process is not
// defined" on init and the entire renderer dies (no boot, dead buttons).
//
// Injected into every module via esbuild `--inject:` so it runs BEFORE any code
// that touches `process`.
if (typeof globalThis.process === "undefined") {
  globalThis.process = {
    env: { NODE_ENV: "production" },
    platform: "browser",
    nextTick: function (fn) {
      Promise.resolve().then(fn);
    },
    version: "",
    versions: {},
  };
}
