# 3. Event-Driven Clipboard Monitoring via Win32 API

Date: 2026-10-13

## Status
Accepted

## Context
Polling the clipboard via `setInterval(500)` constantly wakes up the Node.js event loop twice per second, creating unnecessary CPU wakeups and battery drain on portable computers.

## Decision
Migrate from interval polling to native Windows clipboard notification events (`WM_CLIPBOARDUPDATE` via `AddClipboardFormatListener`). Clipboard reads are scheduled asynchronously on Node.js `setImmediate` with a 50 ms debounce to protect against rapid Ctrl+C keystroke spam and multiple format writes by external applications.

## Consequences
- Idle CPU consumption drops to true 0.00%.
- Eliminates thread wakeups between copy actions.
- 50 ms debounce ensures atomic capture of final clipboard state during rapid copy operations.
