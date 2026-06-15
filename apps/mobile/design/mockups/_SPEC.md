# Build spec — PlacementRanker Mobile mockups

You are building **rendered HTML phone mockups** for a class-centric, dual-role (student + teacher) redesign of an Expo app. They render as cards on a design canvas. Match the two reference files **exactly**: `00-foundations.html` and `01-class-hub.html`. Read those first.

## Hard rules
1. **Self-contained.** Each `.html` file inlines the COMPLETE contents of `_kit.css` inside a `<style>` tag (read the file, paste it verbatim). Then a SECOND `<style>` may hold tiny screen-specific tweaks. No external stylesheet links except Google Fonts.
2. **Line 1 is the card marker**, exactly: `<!-- @dsCard group="GROUP" name="NAME" subtitle="SUBTITLE" -->` then `<!DOCTYPE html>`.
3. **Fonts** via `<link>`: `https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap`
4. **All numerals** (scores, ranks, %, timers, counts, dates) use the mono class / `font-family:var(--m)`. Headlines + labels use Space Grotesk (`var(--d)`). Body uses Inter.
5. **Flare (`--flare` / `.flare` / `--grad-flare`) is ONLY** for LIVE / urgent / streak / at-risk / rank-up. Never decoration.
6. Use **real field names and realistic content** from the data the orchestrator gives you (real labels like "Mock Test 4", "94th percentile", "DSA Mastery Batch", teacher "Aman Verma"). No lorem ipsum.
7. Use the kit classes. Don't invent new color hexes — use the CSS variables.

## Phone frame template (most screens)
```html
<body>
<div class="stage">
  <div class="col">
    <div class="phone"><div class="scr">
      <div class="status"><span>9:41</span><span>● ● ●  ▮</span></div>
      <div class="bodyscroll">
        <!-- titlebar / lhead / clsbar, then screen content -->
      </div>
      <div class="tabs"><!-- 5 tabs, one .on --></div>
    </div></div>
    <div class="cap">One-line caption of what this screen does.</div>
  </div>
</div>
</body>
```
- Student tab bar: Home · Classes · Practice · Compete · You
- Teacher tab bar: Dash · Classes · Students · Content · You
- For TWO-phone cards (e.g. attempt+result), put two `.col` blocks in the `.stage`.
- For dense ANALYTICS screens, you may use `.board` + `.panel` desktop layout instead of a phone, OR a taller phone — pick what reads best. Most screens = phone.
- Content should overflow naturally inside `.bodyscroll` (it's clipped — that's fine, it looks like a scrollable screen). Aim to fill the phone.

## The Readiness gauge (signature) — reuse everywhere a score/standing/pulse appears
SVG is always `viewBox="0 0 200 200"`, radius 84, a 270° track. **Value dash = round(value/100 × 395.84).**
Examples: 42→166.2 · 64→253.3 · 72→285.0 · 76→300.8 · 78→308.8 · 83→328.5 · 91→360.2.
Wrap in `.gz` (small, in a hero row), `.gmd` (medium), or `.gbig` (results hero). Pick stroke:
`#g-signal` gradient teal-deep→aqua for good scores; on a dark `.hero.ink` use white-ish; for low scores use flare (`#FF8A3D`).

Standard gauge markup (swap the value dash, the gradient, the wrapper class, and the center text):
```html
<div class="gbig">
  <svg viewBox="0 0 200 200">
    <defs><linearGradient id="gA" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0B7C72"/><stop offset="100%" stop-color="#34E7CE"/>
    </linearGradient></defs>
    <!-- track -->
    <circle cx="100" cy="100" r="84" fill="none" stroke="#E2EAE7" stroke-width="16" stroke-linecap="round"
            stroke-dasharray="395.8 131.9" transform="rotate(135 100 100)"/>
    <!-- ticks (optional, instrument feel) -->
    <circle cx="100" cy="100" r="68" fill="none" stroke="#CED9D5" stroke-width="10"
            stroke-dasharray="2 14.4" transform="rotate(135 100 100)" opacity=".7"/>
    <!-- value (78 → 308.8) -->
    <circle cx="100" cy="100" r="84" fill="none" stroke="url(#gA)" stroke-width="16" stroke-linecap="round"
            stroke-dasharray="308.8 527.7" transform="rotate(135 100 100)"
            style="filter:drop-shadow(0 4px 12px rgba(52,231,206,.5))"/>
  </svg>
  <div class="c"><b style="color:var(--teal-deep)">78</b><small>/100 · STRONG</small></div>
</div>
```
Give each `<linearGradient>` a UNIQUE id per file (gA, gB…) to avoid collisions.
Bands by value: 0–39 Building (flare) · 40–69 On track (teal) · 70–84 Strong (green) · 85–100 Interview-ready (gradient pill). Use `.band.building/.track/.strong/.ready`.

## Quality bar
Fill the screen, balanced spacing, realistic data, one clear focal point per screen (usually the gauge or the primary list). Mirror the polish of `01-class-hub.html`. When done, output the list of files you wrote.
