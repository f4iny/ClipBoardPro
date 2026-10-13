# ClipBoardPro Project Passport

## 1. Overview & Stack
ClipBoardPro is a lightweight, high-performance clipboard management desktop utility for Windows.
- **Framework:** Electron (ES Module main process, isolated context preload).
- **Renderer UI:** React 18, bundled with Vite/Rollup into `dist-react/`.
- **Packaging:** Packaged in `resources/app.asar`.
- **Native Integrations:** Win32 API (`psapi.dll` for memory trimming, `user32.dll` clipboard listeners, WMI process management).

## 2. Directory Layout
- `resources/app.asar`: Production application bundle.
- `docs/adr/`: Formal Architecture Decision Records (ADRs 0001 to 0004).
- `GLOSSARY.md`: Canonical project terms, component naming, and architectural definitions.
- `GOTCHAS.md`: Critical pitfalls, traps, and developer instructions discovered during maintenance.
- `BUGS.md`: Registry of resolved, investigated, and active bugs.
- `DECISIONS.md`: Summary of core engineering choices, trade-offs, and design rationale.

## 3. Mandatory Operational Rules
1. **Zero OS Reboots:** Never reboot, restart, or power down the host Windows operating system.
2. **Safe Asar Packaging:**
   - Always preserve backups (`resources/app.asar.backup_*`) before replacement.
   - Use fast in-place asar patching (`scratch/patch_asar_fast.js`) to prevent unpacking 3,600+ `lucide-react` files into the workspace.
   - Follow Chromium pickle header alignment: `payloadSize = alignedHeaderSize + 8` with 4-byte boundary padding.
3. **Detached Process Spawning:**
   - Spawning `ClipBoardPro.exe` via PowerShell's `Start-Process` inside task runners attaches the process to Windows job objects, terminating the app when the task ends.
   - Always spawn detached via WMI: `Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = '"{0}"' -f ($env:ProgramFiles + '\ClipBoardPro\ClipBoardPro.exe') }`.
   - Wait at least 1000–1200 ms after `Stop-Process` before starting to avoid the single-instance lock race condition.
4. **Contextual Knowledge & Markdown Interaction Rules:**
   - **`GOTCHAS.md` (Traps, quirks, and engineering solutions):**
     - *When to READ:* Before making changes to packaging, process spawning, CSS animations, scroll logic, or IPC. When encountering unexplained crashes, process terminations, or rendering lags.
     - *When to WRITE:* Whenever a new non-obvious trap, OS/driver quirk, race condition, or tooling gotcha is encountered and resolved.
   - **`BUGS.md` (Defect and regression registry):**
     - *When to READ:* When investigating reported bugs, regressions, or performance drops (check prior root causes and existing fixes before coding).
     - *When to WRITE:* Immediately when a bug is confirmed, investigated, or resolved (record symptoms, root cause, fix, and test verification).
   - **`DECISIONS.md` & `docs/adr/` (Architectural rationale and trade-offs):**
     - *When to READ:* Before proposing architectural modifications, state management refactors, or storage changes (understand why things are built this way to avoid re-proposing rejected alternatives).
     - *When to WRITE:* Whenever an architectural decision or trade-off is finalized (summarize in `DECISIONS.md` and document formal ADR in `docs/adr/`).
   - **`GLOSSARY.md` (Domain model and terminology):**
     - *When to READ:* When discussing features or naming new functions, files, and IPC channels (maintain strict naming consistency).
     - *When to WRITE:* When introducing new domain concepts, services, or architecture entities.
