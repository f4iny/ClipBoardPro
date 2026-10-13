# BUGS Registry & Resolution History

This file tracks all identified bugs, their root causes, and their verified fixes in ClipBoardPro.

| ID | Title | Severity | Status | Verified By |
| :--- | :--- | :--- | :--- | :--- |
| **BUG-001** | `executeJavaScript` 500ms CPU Polling Loop | High | **RESOLVED** | `test/electron/clipboard_debouncer.test.js` |
| **BUG-002** | `QuotaExceededError` & V8 Heap Bloat from Base64 Images | High | **RESOLVED** | ADR 0002 & `test/electron/media_storage.test.js` |
| **BUG-003** | 150 `backdrop-filter: blur(10px)` GPU Shader Lag | High | **RESOLVED** | Visual audit & CSS gradient replacement |
| **BUG-004** | Hardcoded Zero Counts in Filter Dropdown Menu | Medium | **RESOLVED** | `test/components/filtering_and_state.test.js` |
| **BUG-005** | Filter Icon Mismatch (Sort Menu Icon Used Instead of Filter) | Low | **RESOLVED** | Header filter icon component verification |
| **BUG-006** | ReferenceError on `screen` in `main.js` | Critical | **RESOLVED** | Static ESM import in `src/electron/main.js` |
| **BUG-007** | High Idle Memory Footprint in Tray (~476 MB Working Set) | Medium | **RESOLVED** | ADR 0001 & `test/electron/memory_trim.test.js` |
| **BUG-008** | GPU/CPU Load Spike during Active Scrolling on 240 Hz Displays | High | **RESOLVED** | Hardware compositing layers & CSS refactor |
| **BUG-009** | Dormant Clipboard Monitoring on Windows (Missing OS Clipboard Listener Registration) | Critical | **RESOLVED** | Active cross-platform 350ms debounced interval |

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

#### BUG-009: Dormant Clipboard Ingestion on Windows (Missing OS Clipboard Listener Registration)
- **Symptoms:** Application completely failed to intercept Win+Shift+S screenshots and Ctrl+C text copy operations on Windows in standalone builds.
- **Root Cause:** A conditional check `if (process.platform !== 'win32')` prevented the polling interval from starting on Windows under the assumption that `mainWindow.hookWindowMessage(0x031D)` was sufficient. However, Windows requires calling native Win32 `AddClipboardFormatListener(hwnd)` before it sends `WM_CLIPBOARDUPDATE (0x031D)`. Since native listener registration was absent, no messages were received and the polling interval was suppressed.
- **Resolution:** Removed the `process.platform !== 'win32'` suppression, activating a reliable 350 ms polling interval coupled with the 50 ms `ClipboardDebouncer` across all platforms.

#### BUG-010: High GPU Load (~47%) During Scrolling from Unpurged Backdrop-Filter Shaders & Uncapped FPS
- **Symptoms:** Scrolling through clipboard cards spikes and sustains GPU 3D engine usage at ~47%.
- **Root Cause:**
  1. `ClipboardItem.scss` retained `backdrop-filter: blur(10px)` on `.item-number` and all action buttons (`.item-actions button` and `.action-btn`). With 8–10 cards on screen, Skia performed 35–45 real-time Gaussian blur passes per frame across changing background pixels during scroll.
  2. `box-shadow: var(--shadow-md)` on each card and type icon forced texture re-rasterization on layout updates.
  3. Chromium compositor had no frame rate cap, rendering at uncapped monitor refresh rates (120–240 Hz).
  4. Each `ClipboardItem.jsx` instance mounted an independent `MutationObserver` on `document.documentElement` and two `window` event listeners.
- **Resolution:**
  - Removed all `backdrop-filter` blur shaders from recurring card elements, setting them to `none`.
  - Replaced card `box-shadow` with crisp hardware-composited `1px solid var(--border-secondary)` borders.
  - Added Chromium command-line switch `app.commandLine.appendSwitch('limit-fps', '120')` in `main.js`.
  - Replaced JS `MutationObserver` and `getComputedStyle` in `ClipboardItem.jsx` with native CSS variables scoped to card type classes (`.text`, `.code`, `.image`).

