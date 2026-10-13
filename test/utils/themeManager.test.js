import { describe, it, expect, beforeEach } from 'vitest';
import { themeManager } from '../../src/utils/themeManager.js';

describe('ThemeManager (utils/themeManager.js)', () => {
  beforeEach(() => {
    localStorage.clear();
    themeManager.themes.clear();
    themeManager.currentTheme = 'dark';
  });

  it('provides built-in themes dark and light by default', () => {
    const available = themeManager.getAvailableThemes();
    expect(available).toContain('dark');
    expect(available).toContain('light');
  });

  it('saves custom theme and persists in localStorage', async () => {
    const customConfig = {
      name: 'Cyberpunk',
      author: 'Tester',
      background: {
        primary: '#110022',
        secondary: '#220044',
        card: '#330066'
      },
      text: {
        primary: '#00ffcc',
        secondary: '#ff00cc'
      },
      accent: {
        primary: '#ff0077'
      }
    };

    const saved = await themeManager.saveTheme('cyberpunk', customConfig);
    expect(saved).toBe(true);

    const loaded = themeManager.loadThemeConfig('cyberpunk');
    expect(loaded).toBeDefined();
    expect(loaded.name).toBe('cyberpunk');
    expect(loaded.background.primary).toBe('#110022');

    const raw = localStorage.getItem('customThemes');
    expect(raw).toContain('cyberpunk');
  });

  it('validates theme configuration when saving', async () => {
    await expect(themeManager.saveTheme('bad', null)).rejects.toThrow();
    await expect(themeManager.saveTheme('bad', 'string-not-object')).rejects.toThrow();
  });

  it('applies custom theme and sets CSS variables on document element', async () => {
    const themeConfig = {
      background: {
        primary: '#050510',
        card: '#101025'
      },
      text: {
        primary: '#ffffff'
      },
      accent: {
        primary: '#6366f1'
      }
    };

    await themeManager.saveTheme('space', themeConfig);
    await themeManager.applyTheme('space');

    expect(themeManager.getCurrentTheme()).toBe('space');
    expect(document.documentElement.getAttribute('data-theme')).toBe('custom');
    expect(document.documentElement.getAttribute('data-custom-theme')).toBe('space');
  });

  it('falls back to dark theme when current theme is deleted', async () => {
    themeManager.isTransitioning = false;
    await themeManager.saveTheme('temp-theme', { colors: {} });
    themeManager.currentTheme = 'temp-theme';
    expect(themeManager.getCurrentTheme()).toBe('temp-theme');

    await themeManager.deleteTheme('temp-theme');
    expect(themeManager.getCurrentTheme()).toBe('dark');
    expect(themeManager.loadThemeConfig('temp-theme')).toBeNull();
  });

  it('exports theme with metadata and version', async () => {
    await themeManager.saveTheme('export-me', {
      author: 'Developer',
      description: 'An export test',
      background: { primary: '#123456' }
    });

    const exported = themeManager.exportTheme('export-me');
    expect(exported).toBeDefined();
    expect(exported.name).toBe('export-me');
    expect(exported.author).toBe('Developer');
    expect(exported.exportedBy).toBe('ClipBoard Pro Theme Builder');
    expect(exported.background.primary).toBe('#123456');
  });

  it('reports theme stats accurately', async () => {
    const statsBefore = themeManager.getThemeStats();
    expect(statsBefore.builtInThemes).toBe(2);
    expect(statsBefore.customThemes).toBe(0);

    await themeManager.saveTheme('t1', { colors: {} });
    const statsAfter = themeManager.getThemeStats();
    expect(statsAfter.customThemes).toBe(1);
    expect(statsAfter.totalThemes).toBe(3);
  });
});
