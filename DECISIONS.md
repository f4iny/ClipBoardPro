# Architecture & Engineering Decisions (DECISIONS)

This document explains why key engineering decisions were made in ClipBoardPro, the trade-offs evaluated, and rejected alternatives. For formal architecture documents, see [docs/adr/](./docs/adr/).

---

### DEC-001: Win32 `EmptyWorkingSet` with 2-Second Debounce (ADR 0001)
- **Decision:** Call `EmptyWorkingSet()` on all `ClipBoardPro` processes exactly 2000 ms after the window is hidden to the system tray (`mainWindow.on('hide')`). Cancel the timer immediately if the window is restored before 2 seconds elapse.
- **Why this way:**
  - Simply hiding an Electron window leaves Chromium render buffers, GPU textures, and V8 heaps mapped in physical RAM (~476 MB).
  - Calling `EmptyWorkingSet()` immediately on hide causes memory thrashing if the user rapidly toggles the window with hotkeys. A 2-second debounce ensures the user has genuinely left the app in the background before unmapping inactive memory.
  - Drops physical Working Set to under 26 MB while retaining instant window restore without flash of white.
- **Rejected Alternatives:**
  - *Quitting and re-launching:* Destroys hotkey responsiveness and clipboard monitoring continuity.
  - *Aggressive zero-delay trim:* Caused lag when rapidly opening and closing the window.

---

### DEC-002: Disk-Backed Media Storage with 4 Strict Cleanup Triggers (ADR 0002)
- **Decision:** Store full-resolution captured images on disk at `%APPDATA%\ClipBoardPro\media\<id>.png`. The React renderer only stores metadata, file paths, and 140px previews. Full binaries are cleaned up on:
  1. Individual card deletion.
  2. FIFO list eviction beyond capacity limit (configurable 25–500 items, default 50 via BUG-021).
  3. User triggering "Clear All".
  4. Startup orphan reconciliation.
- **Why this way:**
  - `localStorage` has a strict 5 MB quota in Chromium. A single 4K screenshot can exceed 8 MB in base64, throwing `QuotaExceededError`.
  - Keeping multiple 4K base64 strings in the renderer's V8 heap severely inflates Garbage Collection pauses.
  - The 4-trigger cleanup ensures zero orphan disk clutter and zero memory bloat.
- **Rejected Alternatives:**
  - *IndexedDB for full images:* Avoids the 5 MB limit, but keeps large blobs in V8 memory, making GC slower and increasing Renderer process footprint.

---

### DEC-003: Event-Driven Clipboard Monitoring with 50 ms Debouncing (ADR 0003)
- **Decision:** Hook `WM_CLIPBOARDUPDATE` (0x031D) Windows messages via `mainWindow.hookWindowMessage` and debounce clipboard reads with a 50 ms quiet period (`ClipboardDebouncer`).
- **Why this way:**
  - Standard `setInterval(500)` constantly wakes up Node.js and Chromium threads twice a second, preventing CPU cores from entering deep C-states.
  - Applications often write clipboard formats in bursts (e.g., text, Unicode, HTML, bitmap). The 50 ms debounce ensures atomic capture of the final stable payload and protects against rapid Ctrl+C keystroke spam.
- **Rejected Alternatives:**
  - *Immediate read on event without debouncing:* Causes duplicate events and reads intermediate/incomplete clipboard states during multi-format external copies.

---

### DEC-004: Native Chromium Content Visibility over JS Virtualization (ADR 0004)
- **Decision:** Use native CSS `content-visibility: auto`, `contain: paint`, and `contain-intrinsic-size: 0 140px` on list cards instead of JavaScript virtualization libraries (`react-window`, `react-virtualized`).
- **Why this way:**
  - For typical history sizes (configurable 25–500 items, default 50), JavaScript virtualization adds scroll event listener overhead, complex ref management, and risks visible blank flashes or layout pop-in during high-speed wheel scrolling.
  - Native `content-visibility: auto` delegates off-screen layout omission directly to Chromium's optimized C++ rendering engine.
- **Rejected Alternatives:**
  - *React-window:* Unnecessary overhead and potential white flashes for local clipboard history sizes.

---

### DEC-005: Hardware Compositing & Flat Transitions over Dynamic Gaussian Box-Shadows
- **Decision:** Eliminate `backdrop-filter: blur` from fixed header/footer elements above scrolling areas. Avoid dynamic `box-shadow` and `translateY` animations on card `:hover`. Isolate scrolling viewports using `transform: translateZ(0)` and `will-change: scroll-position`.
- **Why this way:**
  - On high-refresh monitors (such as 240 Hz), Chromium renders up to 240 FPS during interaction.
  - Dynamic `box-shadow` blur transitions cannot be hardware-accelerated on the GPU compositor; Chromium's Skia rasterizer is forced to calculate Gaussian blur convolutions 240 times per second across multiple CPU/GPU threads.
  - Hardware composited layers allow the GPU to scroll by translating texture coordinates in video memory without CPU re-rasterization.
- **Rejected Alternatives:**
  - *Heavy 3D card tilt & blur shaders:* Visually flashy but causes 30–45% GPU load and 15–25% CPU spikes on 240 Hz monitors.

---

### DEC-006: Pure Source Build over In-Place Asar Patching (Superseded)
- **Status:** **Superseded by Fork Repository Migration.**
- **Evolution:**
  - *Initial Stage (Installed Binary):* When maintaining the installed `Program Files` binary without source code, in-place buffer patching (`patch_asar_fast.js`) was used to avoid unpacking 3,690+ `lucide-react` files into the workspace.
  - *Final Stage (Fork Repository):* Migrated to the full developer fork repository (`f4iny/ClipBoardPro`). Code is authored in pure source files (`src/`, `docs/`, `resources/`) and built standardly via Vite and `pnpm run build`.
- **Why this way:**
  - Unpacking `app.asar` writes ~3,690 icon files from `lucide-react` into the file tree, bloating IDE indexers, context tokens, and session startup time.
  - In-place patching completes in under 1 second without leaving thousands of scratch files on disk.

---

### DEC-007: Compositor Frame Rate Cap (120 FPS) and Complete Purge of Recurring Blur Shaders (ADR 0005)
- **Decision:**
  1. Purge all `backdrop-filter: blur(...)` shaders from recurring clipboard list items (`ClipboardItem.scss`) and replace them with `none`.
  2. Replace card `box-shadow` with solid `1px solid var(--border-secondary)` borders.
  3. Cap the Chromium compositor frame rate to 120 FPS using `app.commandLine.appendSwitch('limit-fps', '120')`.
  4. Replace JavaScript `MutationObserver` and `getComputedStyle` theme color polling inside `ClipboardItem.jsx` with native CSS variables scoped to card classes (`.text`, `.code`, `.image`).
- **Why this way:**
  - `backdrop-filter` forces the Skia GPU pipeline to execute Gaussian blur convolution passes on every frame across moving pixels during scrolling. When scrolling on high-refresh monitors with multiple cards in viewport, 35–45 blur passes per frame caused GPU spikes up to ~47%.
  - Capping the compositor to 120 FPS prevents uncapped frame generation (e.g. on 240+ Hz monitors or high-DPI displays) while preserving peak visual smoothness.
  - Native CSS variables eliminate 50 active `MutationObserver` instances in the React DOM.
- **Rejected Alternatives:**
  - *Leaving backdrop-filter with CSS contain:* `contain` cannot isolate `backdrop-filter` because the effect inherently samples external background pixels behind the element.

