# 1. Working Set Trimming on Idle

Date: 2026-10-13

## Status
Accepted

## Context
When ClipBoardPro runs minimized in the Windows system tray, its combined Electron processes (Main, Renderer, GPU, Network) retained approximately 476 MB of RAM in their active working sets. This memory was retained despite the window being invisible. Live testing demonstrated that invoking Win32 `EmptyWorkingSet()` drops active physical memory to under 5 MB with zero degradation to the user experience upon restoration.

## Decision
Invoke `EmptyWorkingSet()` across all application processes with a 2-second debounce after the main window is hidden (`mainWindow.on('hide')`). If the window is unhidden before the 2-second timeout expires, the operation is cancelled.

## Consequences
- Idle physical RAM usage drops from ~470 MB to under 10 MB in the system tray.
- Restoring the window remains near-instantaneous as Windows transparently pages back active memory.
