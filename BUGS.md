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
| **BUG-010** | High GPU Load (~47%) During Scrolling from Backdrop Shaders | High | **RESOLVED** | Shader purge, 120 FPS cap & CSS variable refactor |
| **BUG-011** | Secondary Instance Lock Exit Bypass (Async `app.quit()` Continuation) | Critical | **RESOLVED** | Synchronous `process.exit(0)` on lock failure |
| **BUG-012** | Consecutive Matching-Resolution Screenshots Discarded & V8 Heap Bloat | Critical | **RESOLVED** | `test/electron/image_deduplication.test.js` & Bitmap MD5 Hashing |
| **BUG-013** | Global Listener Destruction via `TitleBar` Unmount (`removeAllListeners`) | High | **RESOLVED** | Scoped `cleanup()` unbind and removal of global purge |
| **BUG-014** | Multi-tier Internal Copy Timeout Race & 5-Second System Clipboard Blindness | High | **RESOLVED** | Content-based deduplication without blind lockout timers |
| **BUG-015** | Fatal Duplicate IPC Handler Crash on Secondary Window Creation | High | **RESOLVED** | Top-level module `registerWindowIpcHandlers()` registration |
| **BUG-016** | Missing Electron Navigation Sandbox Guards & Window Open Interception | High | **RESOLVED** | `sandbox: true`, `setWindowOpenHandler`, `will-navigate` |
| **BUG-017** | Unused `lucide-react` Dependency Inflation (3 690 Extraneous Files) | High | **RESOLVED** | Package uninstalled via `pnpm remove lucide-react` |

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

#### BUG-011: Secondary Instance Lock Exit Bypass (Async `app.quit()` Continuation)
- **Symptoms:** Running a second instance of `ClipBoardPro.exe` caused file-lock contention and flickering tray icon/window creation before quitting.
- **Root Cause:** `app.quit()` in Electron is asynchronous and signals the event loop to exit on the next tick. The secondary instance continued synchronous execution through the rest of `main.js`, creating media directories, loading configuration, and attaching `app.whenReady()` handlers.
- **Resolution:** Added synchronous `process.exit(0)` immediately following `app.quit()` when `!gotTheLock`.

#### BUG-012: Consecutive Matching-Resolution Screenshots Discarded & V8 Heap Bloat
- **Symptoms:** Taking two consecutive full-screen screenshots (or copying two distinct images sharing the same dimensions, e.g. 1920x1080) caused the second image to be silently ignored and dropped from history. Furthermore, V8 heap was bloated with up to 50 MB DataURLs in `lastClipboardImage`.
- **Root Cause:** Image deduplication checked `sameAsLast = lastImageSize.width === imgSize.width && lastImageSize.height === imgSize.height`. If dimensions matched, `if (!sameAsLast)` short-circuited the entire save-to-disk and IPC notification pipeline, making the content check unreachable.
- **Resolution:**
  - Replaced dimension check and 50 MB Base64 string retention with fast bitmap MD5 hashing (`crypto.createHash('md5').update(currentImage.toBitmap()).digest('hex')`).
  - Unified screenshot and clipboard image handling into a single deduplicated `processClipboardImage` function.
  - Verified with `test/electron/image_deduplication.test.js`.

#### BUG-013: Global Listener Destruction via `TitleBar` Unmount (`removeAllListeners`)
- **Symptoms:** Re-rendering or unmounting `TitleBar` (e.g. in React 18 StrictMode or theme toggling) permanently killed clipboard event ingestion in `App.jsx`.
- **Root Cause:** `TitleBar.jsx` invoked `window.electronAPI.removeAllListeners()`, which internally called `ipcRenderer.removeAllListeners('clipboard-changed')`.
- **Resolution:** Removed the call from `TitleBar.jsx` (relying on scoped `cleanup()`) and removed `removeAllListeners` from `preload.js`.

#### BUG-014: Multi-tier Internal Copy Timeout Race & 5-Second System Clipboard Blindness
- **Symptoms:** Copying an item from ClipBoardPro blocked capturing any external clipboard updates for 5 seconds.
- **Root Cause:** Three uncoordinated layers (`ClipboardItem.jsx` 3s timer, `App.jsx` 5s global flag, `main.js` 1.2s timeout) locked out incoming events.
- **Resolution:** Replaced blind time-based lockouts with synchronous content recording in `main.js` (`lastClipboardText`, `lastClipboardImageHash`), eliminating all React timeouts and `stopMonitoring` invocations. Verified with `test/electron/security_and_handlers.test.js`.

#### BUG-015: Fatal Duplicate IPC Handler Crash on Secondary Window Creation
- **Symptoms:** Calling `createWindow()` a second time (e.g. on macOS `activate` or crash recovery) threw `Error: Attempted to register a second handler for 'window-minimize'` and crashed Electron.
- **Root Cause:** `ipcMain.handle` registrations were declared inside the body of `createWindow()`.
- **Resolution:** Extracted all window control IPC handlers to `registerWindowIpcHandlers()`, executed once on `app.whenReady()`.

#### BUG-016: Missing Electron Navigation Sandbox Guards & Window Open Interception
- **Symptoms:** Unconstrained child windows could be opened via `window.open` or links with `target="_blank"`, and main window lacked OS sandbox isolation.
- **Root Cause:** Missing `sandbox: true`, `setWindowOpenHandler`, and `will-navigate` event interceptors in `main.js`.
- **Resolution:** Configured `sandbox: true`, forced `setWindowOpenHandler` to delegate `http/https` to `shell.openExternal` and return `{ action: 'deny' }`, and intercepted `will-navigate`. Verified with `test/electron/security_and_handlers.test.js`.

#### BUG-017: Unused `lucide-react` Dependency Inflation (3 690 Extraneous Files)
- **Symptoms:** 3 690 icon files packaged into `app.asar`, causing build bloat and slow asar packaging (GOTCHAS.md).
- **Root Cause:** `lucide-react` was listed in `package.json` dependencies despite having 0 imports in `src/`.
- **Resolution:** Removed package via `pnpm remove lucide-react`.
#### BUG-018: Nested Component Declaration in `ThemeBuilder.jsx` (MED-01)
- **Symptoms:** Typing hex codes or interacting with inputs inside `ColorPicker` caused text inputs to lose focus, reset cursor position, and trigger full sub-DOM teardown on every keystroke.
- **Root Cause:** `ColorPicker` and `SliderInput` were declared inside the function body of `ThemeBuilder`, causing React to recreate their component types on every render.
- **Resolution:** Moved `ColorPicker` and `SliderInput` to module scope at the top of `ThemeBuilder.jsx`.

#### BUG-019: Artificial 800ms Cold-Start Delay in `App.jsx` (MED-02)
- **Symptoms:** Application startup showed a spinning loader for 800 ms even though history data was already present in `localStorage`.
- **Root Cause:** History reading effect used an arbitrary `setTimeout(..., 800)` callback.
- **Resolution:** Removed `setTimeout`, loading history synchronously and immediately clearing loading state.

#### BUG-020: Redundant Skia Image Resizing & Base64 Serialization in `main.js` (MED-03)
- **Symptoms:** Capturing clipboard images caused CPU spikes and memory allocations due to Skia downscaling and Base64 string generation for a `thumbnail` field that the UI completely ignored (cards load disk image paths with `loading="lazy"`).
- **Root Cause:** `processClipboardImage()` generated and sent unused `thumbnail: thumbnailDataURL`.
- **Resolution:** Stripped Skia resizing and `thumbnailDataURL` generation from `main.js`.

#### BUG-021: Phantom IPC Methods & Disconnected Storage Limit Controls (MED-04 & MED-05)
- **Symptoms:** `SettingsModal` called nonexistent `window.electronAPI.getLanguage` and `setLanguage`, and the "Maximum items" select control had no `value` or `onChange` handler, while history size was hardcoded to 50 items.
- **Root Cause:** Dead IPC boilerplate in `SettingsModal.jsx` and missing state wiring for history capacity.
- **Resolution:** Removed phantom IPC calls, wired `maxHistoryItems` through `App.jsx` and `SettingsModal.jsx`, persisted the preference in `localStorage.appSettings`, dynamically enforced the limit upon capture and setting reduction, and marked unsupported auto-delete options as in development.

#### BUG-022: Windows Drive Letter Casing Inconsistency in `media:delete` (MED-07)
- **Symptoms:** Deleting media items or pruning history on Windows silently failed to unlink files from disk when path casing differed (e.g. `c:\` vs `C:\`), leaving orphan PNGs in `%APPDATA%\ClipBoardPro\media`.
- **Root Cause:** `resolvedTarget.startsWith(resolvedMediaDir + path.sep)` performed case-sensitive string matching on Windows where drive letters often differ in casing.
- **Resolution:** Added `.toLowerCase()` normalization for Windows path comparisons in `main.js:media:delete`. Verified with `test/electron/media_storage.test.js`.

#### BUG-023: Non-memoized Context Value in `LanguageProvider.jsx` (MED-08)
- **Symptoms:** Any internal re-render of `LanguageProvider` forced full subtree re-renders of all components consuming `useLanguage()`.
- **Root Cause:** Context `value` object was created anew on every render without `useMemo`.
- **Resolution:** Wrapped context value with `useMemo(..., [language, setLanguage, isLoading])`.

