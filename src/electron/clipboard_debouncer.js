/**
 * ClipboardDebouncer - Coalesces rapid clipboard update events (ADR-0003)
 * Protects against external multi-format writes and Ctrl+C rapid keystrokes.
 */
export class ClipboardDebouncer {
  constructor({ delayMs = 50, onClipboardChange } = {}) {
    this.delayMs = delayMs;
    this.onClipboardChange = onClipboardChange;
    this.timer = null;
    this.lastPayload = null;
  }

  get isPending() {
    return this.timer !== null;
  }

  trigger(payload = null) {
    this.lastPayload = payload;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.onClipboardChange) {
        this.onClipboardChange(this.lastPayload);
      }
    }, this.delayMs);
  }

  cancel() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.lastPayload = null;
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      if (this.onClipboardChange) {
        this.onClipboardChange(this.lastPayload);
      }
    }
  }
}
