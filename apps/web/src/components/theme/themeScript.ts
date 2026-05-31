/**
 * Blocking, render-before-paint script that resolves the persisted theme and
 * sets the `.dark` class + `color-scheme` on <html> BEFORE the first paint.
 * This is what prevents a flash of the wrong theme (FOUC) on load. It is
 * injected verbatim into the document <head> by the root layout.
 *
 * Keep it tiny, dependency-free, and resilient — any throw (e.g. localStorage
 * blocked in private mode) silently falls back to the light/system default.
 */
export const THEME_STORAGE_KEY = "digimine-theme";

export const themeInitScript = `(function(){try{var k="${THEME_STORAGE_KEY}";var t=localStorage.getItem(k)||"system";var m=window.matchMedia("(prefers-color-scheme: dark)").matches;var d=t==="dark"||(t==="system"&&m);var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
