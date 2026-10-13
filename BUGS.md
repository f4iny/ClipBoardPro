# BUGS Registry & Resolution History

This file tracks all identified bugs, their root causes, and their verified fixes in ClipBoardPro.

| ID | Title | Severity | Status | Verified By |
| :--- | :--- | :--- | :--- | :--- |
| **BUG-001** | `executeJavaScript` 500ms CPU Polling Loop | High | **RESOLVED** | Unit tests & `measure_perf_baseline.ps1` |
| **BUG-002** | `QuotaExceededError` & V8 Heap Bloat from Base64 Images | High | **RESOLVED** | ADR 0002 & `slice2_media_storage.test.mjs` |
| **BUG-003** | 150 `backdrop-filter: blur(10px)` GPU Shader Lag | High | **RESOLVED** | `glassmorphism_and_thumbnail.test.mjs` |
| **BUG-004** | Hardcoded Zero Counts in Filter Dropdown Menu | Medium | **RESOLVED** | `filter_counts_and_icon.test.mjs` |
| **BUG-005** | Filter Icon Mismatch (Sort Menu Icon Used Instead of Filter) | Low | **RESOLVED** | `filter_counts_and_icon.test.mjs` |
| **BUG-006** | ReferenceError on `screen` in `main.js` | Critical | **RESOLVED** | `perf_and_bug_fixes.test.mjs` |
| **BUG-007** | High Idle Memory Footprint in Tray (~476 MB Working Set) | Medium | **RESOLVED** | ADR 0001 & `slice1_memory_manager.test.mjs` |
| **BUG-008** | GPU/CPU Load Spike during Active Scrolling on 240 Hz Displays | High | **RESOLVED** | `active_interaction_perf.test.mjs` |

---

### Detailed Bug Reports

#### BUG-001: Constant CPU Wakeups from `executeJavaScript` Polling
- **Symptoms:** App consumed continuous 0.2%–0.5% CPU when idle in background.
- **Root Cause:** A 500 ms `setInterval` in `main.js` called `mainWindow.webContents.executeJavaScript()` to read an internal copy flag from the DOM window object twice every second.
- **Resolution:** Removed DOM JavaScript execution from the clipboard loop. Replaced with an in-memory flag in `main.js` (`markInternalCopy()` / `checkInternalCopyFlag()`).

#### BUG-002: `QuotaExceededError` from Full Base64 Images in `localStorage`
- **Symptoms:** High-res screenshots crashed `localStorage.setItem('clipboardHistory')` due to the 5 MB browser storage quota.
- **Root Cause:** The renderer stored full 4K base64 image strings directly in `localStorage` and V8 memory.
- **Resolution:** Implemented `MediaStorageManager` (ADR 0002). Full binaries are saved to `%APPDATA%\ClipBoardPro\media\<id>.png`, while `localStorage` stores only file paths and lightweight 140px thumbnails. Applied 4 strict cleanup triggers.

#### BUG-003: 150 `backdrop-filter: blur(10px)` Shaders Causing GPU Overload
- **Symptoms:** Noticeable stutter and micro-freezes during rapid scrolling through history.
- **Root Cause:** Every card element in `.clipboard-item` had `-webkit-backdrop-filter: blur(10px)`. 50 visible cards forced Chromium to render up to 150 Gaussian blur shader passes on every scroll tick.
- **Resolution:** Replaced blur shaders on repeating cards with high-performance CSS multi-stop linear gradients mimicking frosted glass at zero shader cost.

#### BUG-004: Hardcoded Zero Counts in Filter Dropdown Menu
- **Symptoms:** Filter menu showed `All (N)`, but `Text (0)`, `Image (0)`, `Code (0)` despite having items of those types.
- **Root Cause:** The component dynamically computed total count `t.length`, but hardcoded zeroes for subcategories: `u ? e.count : 0`.
- **Resolution:** Computed real-time category counts via `items.filter(x => x.type === type).length`.

#### BUG-005: Filter Icon Mismatch (Sort Menu Icon Used Instead of Filter)
- **Symptoms:** Filter button displayed 3 horizontal lines (`Menu`/`ListFilter` glyph) instead of a funnel icon.
- **Root Cause:** The SVG path used an offset icon asset instead of standard funnel geometry.
- **Resolution:** Replaced path data with canonical funnel filter glyph (`M22 3H2l8 9.46V19l4 2v-8.54L22 3z`).

#### BUG-006: ReferenceError on `screen` in `main.js`
- **Symptoms:** Quick-access window positioning threw `ReferenceError: require is not defined`.
- **Root Cause:** An inline call `const { screen } = require('electron')` was placed in an ES Module file (`"type": "module"`).
- **Resolution:** Imported `screen` statically from `'electron'` at the top of `main.js`.

#### BUG-007: High Idle Memory Footprint in Tray (~476 MB Working Set)
- **Symptoms:** Application occupied ~476 MB of physical RAM even when minimized to the system tray.
- **Root Cause:** Chromium caches rendering buffers and V8 heaps by default when hidden.
- **Resolution:** Implemented `MemoryManager` (ADR 0001) with a 2-second debounce after hide, calling Win32 `EmptyWorkingSet`. Memory drops to 17–26 MB when minimized.

#### BUG-008: GPU/CPU Load Spike during Active Scrolling on 240 Hz Displays
- **Symptoms:** Scrolling and moving cursor loaded CPU to 15–25% and GPU to 30–45% (3D engine).
- **Root Cause:** On 240 Hz displays, Chromium renders at 240 FPS. Four header/footer buttons still had `backdrop-filter: blur(10px)` over the scroll area, and card `:hover` animated 25px Gaussian `box-shadow` and `translateY(-2px)`, forcing Skia to re-rasterize Gaussian blurs 240 times per second.
- **Resolution:**
  - Removed remaining `backdrop-filter` from header and footer buttons.
  - Eliminated `box-shadow` and `translateY` animations from card `:hover` (replaced with GPU-accelerated border/background transitions).
  - Promoted scroll viewport and cards to composited hardware layers via `transform: translateZ(0)` and `will-change: scroll-position`.
