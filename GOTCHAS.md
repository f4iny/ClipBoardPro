# GOTCHAS & Pitfalls in ClipBoardPro

This document records non-obvious quirks, developer traps, and hard-won lessons learned while maintaining and optimizing ClipBoardPro. Consult this before making structural, rendering, or process changes.

---

### 1. Artifact Flooding from `node_modules` (3,600+ files)
- **The Trap:** Unpacking `app.asar` into an artifact or session workspace directory results in the environment indexing every single icon file from `node_modules/lucide-react` (~3,690 files). This bloats conversation context and slows down session startup.
- **The Fix:** Never unpack the full `node_modules` directory into workspace folders. Use in-place asar patching (`patch_asar_fast.js`), which reads unchanged dependency buffers directly from the existing `.asar` archive and only modifies specified target files (`dist-react/assets/...`, `src/electron/...`).

---

### 2. Job Object Process Termination by PowerShell Task Runners
- **The Trap:** Launching `ClipBoardPro.exe` using PowerShell's `Start-Process` inside automated background task steps attaches the application to a Windows Job Object. When the script step finishes, Windows terminates all child processes inside the job object, causing the app to silently disappear after 3–5 seconds.
- **The Fix:** Always start the binary via WMI (`Win32_Process::Create`):
  ```powershell
  # Point to the installation executable (e.g., "$env:ProgramFiles\ClipBoardPro\ClipBoardPro.exe")
  $cmd = '"{0}"' -f (Resolve-Path "$env:ProgramFiles\ClipBoardPro\ClipBoardPro.exe" -ErrorAction SilentlyContinue ?? "D:\Program Files\ClipBoardPro\ClipBoardPro.exe")
  Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmd }
  ```
  This detaches the process from the task runner and parents it directly under Windows Explorer/services.

---

### 3. Single-Instance Lock Race Condition on Restart
- **The Trap:** When restarting ClipBoardPro via script, calling `Stop-Process` and immediately launching `Start-Process` without a sufficient delay triggers `app.requestSingleInstanceLock() === false`. The new instance detects that the previous instance still holds the lock file in `%APPDATA%`, logs `QUITTING: another instance holds the lock`, and quits immediately.
- **The Fix:** Always enforce a pause of at least `1000ms–1200ms` between killing the existing process and spawning the new instance:
  ```powershell
  Stop-Process -Name "ClipBoardPro" -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 1200
  ```

---

### 4. 240 Hz High Refresh Rate Render Amplification
- **The Trap:** On high-refresh displays (e.g., 240 Hz), Chromium synchronizes frame rendering with VSync by default, generating up to 240 frames per second during user interaction.
- **Consequences:**
  - `backdrop-filter: blur(10px)` on header/footer buttons forces Skia to re-calculate two-pass Gaussian blurs 240 times per second as cards scroll beneath them.
  - Dynamic `box-shadow` transitions on card `:hover` cannot be accelerated on the GPU compositor; Skia re-rasterizes the 25px blur on every transition frame.
  - `transform: translateY(-2px)` on `:hover` changes layout bounds and forces compositor layer re-tiling.
- **The Fix:**
  - Remove all `backdrop-filter: blur` from fixed elements over scrolling areas (replace with zero-cost CSS gradients).
  - Do not animate `box-shadow` or layout geometry (`translateY`) on card hover; use GPU-composited `background-color` and `border-color` transitions.
  - Promote `.main-content` and `.clipboard-item` to isolated composited layers using `transform: translateZ(0)` and `will-change: scroll-position`.

---

### 5. Asar Archive Pickle Header Alignment (4-Byte Padding)
- **The Trap:** Chromium's `.asar` reader requires a 16-byte pickle header where:
  - Header JSON size is aligned to 4 bytes: `alignedHeaderSize = (headerJsonSize + 3) & ~3`.
  - The payload size must equal `alignedHeaderSize + 8`.
  - Zero-byte padding (`alignedHeaderSize - headerJsonSize`) must be inserted before file payload data.
  If this alignment is missing, Electron throws a corrupted archive error or fails to load entry modules.

---

### 6. Mixing ES Modules with CommonJS in Electron
- **The Trap:** `main.js` is declared as an ES Module (`"type": "module"` in `package.json`). Calling CommonJS `const { screen } = require('electron')` inside an ESM file throws a runtime ReferenceError.
- **The Fix:** Always import Electron modules at the top level: `import { app, BrowserWindow, screen, ... } from 'electron';`.
