import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClipboardDebouncer } from '../../src/electron/clipboard_debouncer.js';

describe('ClipboardDebouncer (ADR-0003)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with default delay of 50ms and is not pending', () => {
    const debouncer = new ClipboardDebouncer();
    expect(debouncer.delayMs).toBe(50);
    expect(debouncer.isPending).toBe(false);
  });

  it('triggers callback after delay elapsed', () => {
    const callback = vi.fn();
    const debouncer = new ClipboardDebouncer({ delayMs: 50, onClipboardChange: callback });

    debouncer.trigger('test text');
    expect(debouncer.isPending).toBe(true);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(49);
    expect(callback).not.toHaveBeenCalled();
    expect(debouncer.isPending).toBe(true);

    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('test text');
    expect(debouncer.isPending).toBe(false);
  });

  it('coalesces rapid triggers and delivers only the last payload (ADR-0003 burst protection)', () => {
    const callback = vi.fn();
    const debouncer = new ClipboardDebouncer({ delayMs: 50, onClipboardChange: callback });

    debouncer.trigger('burst 1');
    vi.advanceTimersByTime(20);
    debouncer.trigger('burst 2');
    vi.advanceTimersByTime(20);
    debouncer.trigger('burst 3');
    vi.advanceTimersByTime(20);
    debouncer.trigger('final burst');

    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('final burst');
  });

  it('cancels pending trigger without invoking callback', () => {
    const callback = vi.fn();
    const debouncer = new ClipboardDebouncer({ delayMs: 50, onClipboardChange: callback });

    debouncer.trigger('will be cancelled');
    expect(debouncer.isPending).toBe(true);

    debouncer.cancel();
    expect(debouncer.isPending).toBe(false);

    vi.advanceTimersByTime(100);
    expect(callback).not.toHaveBeenCalled();
  });

  it('flushes pending trigger immediately', () => {
    const callback = vi.fn();
    const debouncer = new ClipboardDebouncer({ delayMs: 50, onClipboardChange: callback });

    debouncer.trigger('urgent payload');
    expect(debouncer.isPending).toBe(true);

    debouncer.flush();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('urgent payload');
    expect(debouncer.isPending).toBe(false);

    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('handles flush and cancel gracefully when no trigger is pending', () => {
    const callback = vi.fn();
    const debouncer = new ClipboardDebouncer({ delayMs: 50, onClipboardChange: callback });

    expect(() => debouncer.cancel()).not.toThrow();
    expect(() => debouncer.flush()).not.toThrow();
    expect(callback).not.toHaveBeenCalled();
  });
});
