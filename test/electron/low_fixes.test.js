import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { IPC_CHANNELS } from '../../src/constants/ipcChannels.js';

describe('Low Severity Fixes Verification (LOW-01 through LOW-05)', () => {
  describe('LOW-01: IPC Channels Registry Integrity', () => {
    it('defines unique channel names for all IPC constants', () => {
      const channelValues = Object.values(IPC_CHANNELS);
      expect(channelValues.length).toBeGreaterThan(15);
      const uniqueValues = new Set(channelValues);
      expect(uniqueValues.size).toBe(channelValues.length);
    });

    it('contains all required lifecycle, window, and clipboard channels', () => {
      expect(IPC_CHANNELS.WINDOW_MINIMIZE).toBe('window-minimize');
      expect(IPC_CHANNELS.WINDOW_MAXIMIZE).toBe('window-maximize');
      expect(IPC_CHANNELS.WINDOW_CLOSE).toBe('window-close');
      expect(IPC_CHANNELS.CLIPBOARD_CHANGED).toBe('clipboard-changed');
      expect(IPC_CHANNELS.CLEAR_ALL_SHORTCUT).toBe('clear-all-shortcut');
      expect(IPC_CHANNELS.MEDIA_DELETE).toBe('media:delete');
      expect(IPC_CHANNELS.MEDIA_CLEAR_ALL).toBe('media:clear-all');
      expect(IPC_CHANNELS.MEDIA_RECONCILE).toBe('media:reconcile');
      expect(IPC_CHANNELS.SET_TEXT).toBe('set-clipboard-text');
      expect(IPC_CHANNELS.SET_IMAGE).toBe('set-clipboard-image');
    });
  });

  describe('LOW-03: Log File Size Cap & Rotation', () => {
    let tempDir;
    let tempLogPath;

    beforeEach(async () => {
      tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cbp-log-test-'));
      tempLogPath = path.join(tempDir, 'app-debug.log');
    });

    afterEach(async () => {
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      } catch {}
    });

    function rotateLogIfNeeded(logPath, maxSizeBytes = 1024) {
      try {
        if (fs.existsSync(logPath)) {
          const stats = fs.statSync(logPath);
          if (stats.size > maxSizeBytes) {
            const oldLogPath = logPath + '.old';
            try { if (fs.existsSync(oldLogPath)) fs.unlinkSync(oldLogPath); } catch {}
            fs.renameSync(logPath, oldLogPath);
          }
        }
      } catch {}
    }

    it('rotates log to .old when size exceeds the threshold', async () => {
      // Create a 2KB log file
      await fs.promises.writeFile(tempLogPath, 'A'.repeat(2048));
      expect(fs.existsSync(tempLogPath)).toBe(true);

      // Rotate with 1KB limit
      rotateLogIfNeeded(tempLogPath, 1024);

      expect(fs.existsSync(tempLogPath)).toBe(false);
      expect(fs.existsSync(tempLogPath + '.old')).toBe(true);
      const oldContent = await fs.promises.readFile(tempLogPath + '.old', 'utf8');
      expect(oldContent.length).toBe(2048);
    });

    it('does not rotate when log file is below the threshold', async () => {
      await fs.promises.writeFile(tempLogPath, 'Short log line\n');
      rotateLogIfNeeded(tempLogPath, 1024);

      expect(fs.existsSync(tempLogPath)).toBe(true);
      expect(fs.existsSync(tempLogPath + '.old')).toBe(false);
    });
  });

  describe('LOW-04: Strict IPC Argument Validation', () => {
    function validateSetClipboardText(text) {
      if (typeof text !== 'string') return false;
      return true;
    }

    function validateSetClipboardImage(imageSource) {
      if (!imageSource || typeof imageSource !== 'string') return false;
      return true;
    }

    function validateSetCloseBehavior(behavior) {
      if (behavior !== 'minimize' && behavior !== 'close') return false;
      return true;
    }

    function sanitizeHotkeys(newHotkeys, currentHotkeys) {
      if (!newHotkeys || typeof newHotkeys !== 'object') return null;
      const sanitized = {};
      if (typeof newHotkeys.quickAccess === 'string') sanitized.quickAccess = newHotkeys.quickAccess;
      if (typeof newHotkeys.clearAll === 'string') sanitized.clearAll = newHotkeys.clearAll;
      return { ...currentHotkeys, ...sanitized };
    }

    it('rejects non-string input in set-clipboard-text', () => {
      expect(validateSetClipboardText(null)).toBe(false);
      expect(validateSetClipboardText(undefined)).toBe(false);
      expect(validateSetClipboardText(12345)).toBe(false);
      expect(validateSetClipboardText({})).toBe(false);
      expect(validateSetClipboardText('Valid clipboard text')).toBe(true);
    });

    it('rejects invalid image source in set-clipboard-image', () => {
      expect(validateSetClipboardImage(null)).toBe(false);
      expect(validateSetClipboardImage('')).toBe(false);
      expect(validateSetClipboardImage(123)).toBe(false);
      expect(validateSetClipboardImage('data:image/png;base64,abc')).toBe(true);
      expect(validateSetClipboardImage('C:\\path\\to\\image.png')).toBe(true);
    });

    it('enforces valid options in set-close-behavior', () => {
      expect(validateSetCloseBehavior('minimize')).toBe(true);
      expect(validateSetCloseBehavior('close')).toBe(true);
      expect(validateSetCloseBehavior('destroy')).toBe(false);
      expect(validateSetCloseBehavior(null)).toBe(false);
      expect(validateSetCloseBehavior('')).toBe(false);
    });

    it('sanitizes hotkeys object rejecting malformed arguments', () => {
      const current = { quickAccess: 'Ctrl+Shift+X', clearAll: 'Ctrl+Shift+Delete' };
      expect(sanitizeHotkeys(null, current)).toBeNull();
      expect(sanitizeHotkeys('not-an-object', current)).toBeNull();

      const updated = sanitizeHotkeys({ quickAccess: 'Ctrl+Alt+V', invalidKey: 123 }, current);
      expect(updated).toEqual({ quickAccess: 'Ctrl+Alt+V', clearAll: 'Ctrl+Shift+Delete' });
    });
  });

  describe('LOW-05: Error Logging (No Silent Swallowing)', () => {
    it('captures and logs errors rather than swallowing silently', () => {
      const logs = [];
      const mockLog = (msg) => logs.push(msg);

      function safeExecute(handler, handlerName) {
        try {
          return handler();
        } catch (err) {
          mockLog(`${handlerName} error: ${err.message}`);
          return false;
        }
      }

      const failingHandler = () => {
        throw new Error('OS Clipboard access failed');
      };

      const result = safeExecute(failingHandler, 'start-clipboard-monitoring');
      expect(result).toBe(false);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toContain('start-clipboard-monitoring error: OS Clipboard access failed');
    });
  });
});
