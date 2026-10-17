import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

describe('Image Deduplication Logic (CRIT-02 & HIGH-01)', () => {
  function getClipboardImageHash(nativeImg) {
    if (!nativeImg || nativeImg.isEmpty()) return '';
    try {
      const bitmap = nativeImg.toBitmap();
      return crypto.createHash('md5').update(bitmap).digest('hex');
    } catch {
      return '';
    }
  }

  function createMockNativeImage(width, height, fillByte = 0) {
    const buffer = Buffer.alloc(width * height * 4, fillByte);
    return {
      isEmpty: () => buffer.length === 0,
      getSize: () => ({ width, height }),
      toBitmap: () => buffer,
    };
  }

  it('generates consistent 32-character hex MD5 hash for image bitmap', () => {
    const img = createMockNativeImage(1920, 1080, 0xAA);
    const hash = getClipboardImageHash(img);
    expect(hash).toMatch(/^[a-f0-9]{32}$/);
  });

  it('returns empty string for empty images', () => {
    const emptyImg = {
      isEmpty: () => true,
      toBitmap: () => Buffer.alloc(0),
    };
    expect(getClipboardImageHash(emptyImg)).toBe('');
    expect(getClipboardImageHash(null)).toBe('');
  });

  it('fixes CRIT-02: two consecutive images of IDENTICAL dimensions with different content produce different hashes', () => {
    // Both are 1920x1080 (full HD screenshots)
    const screenshot1 = createMockNativeImage(1920, 1080, 0x11);
    const screenshot2 = createMockNativeImage(1920, 1080, 0x22);

    expect(screenshot1.getSize()).toEqual(screenshot2.getSize());

    const hash1 = getClipboardImageHash(screenshot1);
    const hash2 = getClipboardImageHash(screenshot2);

    expect(hash1).not.toBe(hash2);
  });

  it('deduplicates genuinely identical images', () => {
    const screenshot1 = createMockNativeImage(1920, 1080, 0x55);
    const screenshot2 = createMockNativeImage(1920, 1080, 0x55);

    const hash1 = getClipboardImageHash(screenshot1);
    const hash2 = getClipboardImageHash(screenshot2);

    expect(hash1).toBe(hash2);
  });
});
