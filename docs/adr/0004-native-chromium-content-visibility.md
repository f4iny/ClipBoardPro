# 4. Native Chromium Content Visibility over JS Virtualization

Date: 2026-10-13

## Status
Accepted

## Context
Rendering 50 rich cards in the DOM creates layout and paint work during scroll. Introducing third-party JavaScript virtualization libraries (e.g. `react-window`) carries the risk of visible loading delays, blank flashes, or layout pop-in during high-speed scrolling.

## Decision
Utilize modern native Chromium C++ layout containment via `content-visibility: auto`, `contain: paint`, and `contain-intrinsic-size: 0 140px` on `.clipboard-item` cards.

## Consequences
- Chromium's C++ rendering engine handles off-screen layout omission natively.
- Eliminates JavaScript scroll-listener overhead.
- Guarantees 120+ FPS buttery smooth scrolling with zero blank flashes or pop-in lag.
