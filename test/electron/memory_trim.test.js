import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Working Set Trimming on Idle (ADR-0001 / DEC-001)', () => {
  let memoryTrimTimer = null;
  let trimFn;

  function scheduleMemoryTrim(delayMs = 2000) {
    cancelMemoryTrim();
    memoryTrimTimer = setTimeout(() => {
      memoryTrimTimer = null;
      trimFn();
    }, delayMs);
  }

  function cancelMemoryTrim() {
    if (memoryTrimTimer) {
      clearTimeout(memoryTrimTimer);
      memoryTrimTimer = null;
    }
  }

  function isTrimScheduled() {
    return memoryTrimTimer !== null;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    trimFn = vi.fn();
    memoryTrimTimer = null;
  });

  afterEach(() => {
    cancelMemoryTrim();
    vi.restoreAllMocks();
  });

  it('schedules trim with 2000ms debounce delay by default', () => {
    scheduleMemoryTrim();
    expect(isTrimScheduled()).toBe(true);
    expect(trimFn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1999);
    expect(trimFn).not.toHaveBeenCalled();
    expect(isTrimScheduled()).toBe(true);

    vi.advanceTimersByTime(1);
    expect(trimFn).toHaveBeenCalledTimes(1);
    expect(isTrimScheduled()).toBe(false);
  });

  it('cancels scheduled trim when window is restored within 2 seconds (avoids thrashing)', () => {
    scheduleMemoryTrim();
    expect(isTrimScheduled()).toBe(true);

    vi.advanceTimersByTime(1200);
    // User rapidly restores window via hotkey
    cancelMemoryTrim();
    expect(isTrimScheduled()).toBe(false);

    vi.advanceTimersByTime(2000);
    expect(trimFn).not.toHaveBeenCalled();
  });

  it('resets timer when scheduleMemoryTrim is called again before expiry', () => {
    scheduleMemoryTrim(2000);
    vi.advanceTimersByTime(1500);

    // Another event triggers rescheduling
    scheduleMemoryTrim(2000);
    vi.advanceTimersByTime(1500);
    expect(trimFn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(trimFn).toHaveBeenCalledTimes(1);
  });
});
