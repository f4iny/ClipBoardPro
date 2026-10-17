import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Media Storage Lifecycle & Reconciliation (ADR-0002 / DEC-002)', () => {
  let tempMediaDir;

  beforeEach(async () => {
    tempMediaDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cbp-media-test-'));
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(tempMediaDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // Reusable helper modeled on main.js ADR-0002 implementation (with MED-07 fix)
  async function safeDeleteMedia(mediaDir, targetPath) {
    if (!targetPath || typeof targetPath !== 'string') return false;
    const resolvedTarget = path.resolve(targetPath);
    const resolvedMediaDir = path.resolve(mediaDir);
    const isWindows = process.platform === 'win32';
    const targetCheck = isWindows ? resolvedTarget.toLowerCase() : resolvedTarget;
    const dirCheck = isWindows ? resolvedMediaDir.toLowerCase() : resolvedMediaDir;
    if (targetCheck.startsWith(dirCheck + path.sep) && fs.existsSync(resolvedTarget)) {
      await fs.promises.unlink(resolvedTarget);
      return true;
    }
    return false;
  }

  async function clearAllMedia(mediaDir) {
    if (!fs.existsSync(mediaDir)) return false;
    const files = await fs.promises.readdir(mediaDir);
    for (const f of files) {
      if (f.endsWith('.png')) {
        await fs.promises.unlink(path.join(mediaDir, f)).catch(() => {});
      }
    }
    return true;
  }

  async function reconcileMedia(mediaDir, activeFilePaths) {
    if (!fs.existsSync(mediaDir) || !Array.isArray(activeFilePaths)) return false;
    const activeSet = new Set(activeFilePaths.map(p => path.normalize(p).toLowerCase()));
    const files = await fs.promises.readdir(mediaDir);
    for (const f of files) {
      if (f.endsWith('.png')) {
        const full = path.normalize(path.join(mediaDir, f)).toLowerCase();
        if (!activeSet.has(full)) {
          await fs.promises.unlink(path.join(mediaDir, f)).catch(() => {});
        }
      }
    }
    return true;
  }

  it('safely deletes media file inside mediaDir', async () => {
    const file = path.join(tempMediaDir, 'test-img-1.png');
    await fs.promises.writeFile(file, 'fake-png-binary');
    expect(fs.existsSync(file)).toBe(true);

    const deleted = await safeDeleteMedia(tempMediaDir, file);
    expect(deleted).toBe(true);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('safely deletes media file when path casing differs (MED-07 Windows drive/path casing)', async () => {
    const file = path.join(tempMediaDir, 'test-casing.png');
    await fs.promises.writeFile(file, 'test-casing-png');
    expect(fs.existsSync(file)).toBe(true);

    let pathWithDifferentCase = file;
    if (file[1] === ':') {
      const driveLetter = file[0];
      const toggledDrive = driveLetter === driveLetter.toUpperCase() ? driveLetter.toLowerCase() : driveLetter.toUpperCase();
      pathWithDifferentCase = toggledDrive + file.slice(1);
    }

    const deleted = await safeDeleteMedia(tempMediaDir, pathWithDifferentCase);
    expect(deleted).toBe(true);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('rejects path traversal attempts outside mediaDir', async () => {
    const outsideFile = path.join(os.tmpdir(), 'outside-file.png');
    await fs.promises.writeFile(outsideFile, 'precious-data');

    const deleted = await safeDeleteMedia(tempMediaDir, outsideFile);
    expect(deleted).toBe(false);
    expect(fs.existsSync(outsideFile)).toBe(true);

    // cleanup outside file
    await fs.promises.unlink(outsideFile);
  });

  it('clears all PNG files in mediaDir', async () => {
    const f1 = path.join(tempMediaDir, 'img1.png');
    const f2 = path.join(tempMediaDir, 'img2.png');
    const txt = path.join(tempMediaDir, 'keep.txt');

    await fs.promises.writeFile(f1, 'png1');
    await fs.promises.writeFile(f2, 'png2');
    await fs.promises.writeFile(txt, 'text');

    const result = await clearAllMedia(tempMediaDir);
    expect(result).toBe(true);
    expect(fs.existsSync(f1)).toBe(false);
    expect(fs.existsSync(f2)).toBe(false);
    expect(fs.existsSync(txt)).toBe(true);
  });

  it('reconciles active paths and unlinks orphaned images', async () => {
    const active1 = path.join(tempMediaDir, 'active1.png');
    const active2 = path.join(tempMediaDir, 'active2.png');
    const orphan = path.join(tempMediaDir, 'orphan.png');

    await fs.promises.writeFile(active1, 'png1');
    await fs.promises.writeFile(active2, 'png2');
    await fs.promises.writeFile(orphan, 'orphan');

    const result = await reconcileMedia(tempMediaDir, [active1, active2]);
    expect(result).toBe(true);

    expect(fs.existsSync(active1)).toBe(true);
    expect(fs.existsSync(active2)).toBe(true);
    expect(fs.existsSync(orphan)).toBe(false);
  });
});
