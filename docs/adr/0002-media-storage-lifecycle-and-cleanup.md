# 2. File-Backed Media Storage with Lifecycle Cleanup

Date: 2026-10-13

## Status
Accepted

## Context
Storing full-resolution screenshot images as Base64 data URLs in HTML5 `localStorage` hits the 5 MB browser storage quota and inflates V8 heap memory. Storing full binaries in disk files requires strict lifecycle hygiene to avoid unbounded disk growth and orphaned files.

## Decision
Save captured full-resolution images as individual files in `%APPDATA%\ClipBoardPro\media\<id>.png`. The React UI and `localStorage` store only item metadata and a small thumbnail preview. Full binary files are deleted from disk upon:
1. Individual item deletion by the user.
2. FIFO history eviction when the item list exceeds 50 items.
3. User triggering the "Clear All" action.
4. Application startup orphan reconciliation (deleting any files in `media/` not referenced by the stored history).

## Consequences
- Eliminates `QuotaExceededError` crashes in `localStorage`.
- Reduces Renderer memory footprint.
- Prevents disk clutter through 4 automated cleanup triggers.
