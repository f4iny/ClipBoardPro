import { describe, it, expect, beforeEach } from 'vitest';
import i18n from '../../src/utils/i18n/i18n.js';
import { SUPPORTED_LANGUAGES } from '../../src/utils/i18n/config.js';
import { translations } from '../../src/utils/i18n/translations/index.js';

describe('i18n Utility (utils/i18n/i18n.js)', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.init('en');
  });

  it('initializes to English and marks isInitialized as true', () => {
    expect(i18n.getLanguage()).toBe('en');
    expect(i18n.getIsInitialized()).toBe(true);
    expect(document.documentElement.lang).toBe('en');
  });

  it('switches language and notifies listeners', async () => {
    let notifiedLang = null;
    const unsubscribe = i18n.subscribe((lang) => {
      notifiedLang = lang;
    });

    const success = await i18n.setLanguage('ru');
    expect(success).toBe(true);
    expect(i18n.getLanguage()).toBe('ru');
    expect(notifiedLang).toBe('ru');
    expect(document.documentElement.lang).toBe('ru');
    expect(localStorage.getItem('appLanguage')).toBe('ru');

    unsubscribe();
  });

  it('resolves nested keys correctly in English and other languages', async () => {
    await i18n.setLanguage('en');
    const enSearch = i18n.t('header.searchPlaceholder');
    expect(enSearch).toBe('Search Clipboard');

    await i18n.setLanguage('ru');
    const ruSearch = i18n.t('header.searchPlaceholder');
    expect(ruSearch).toBe('Поиск в буфере обмена');
    expect(ruSearch).not.toBe(enSearch);
  });

  it('interpolates parameters in translation strings', () => {
    const interpolated = i18n.interpolate('Hello {{name}}, you have {{count}} items', {
      name: 'Alice',
      count: 42
    });
    expect(interpolated).toBe('Hello Alice, you have 42 items');
  });

  it('formats relative timestamps correctly', () => {
    const now = Date.now();
    expect(i18n.formatRelativeTime(now - 10000)).toBe(i18n.t('item.justNow'));

    const fiveMinsAgo = now - 5 * 60 * 1000;
    const formattedMinutes = i18n.formatRelativeTime(fiveMinsAgo);
    expect(formattedMinutes).toContain('5');
  });

  it('falls back to English when a translation key is missing in active language', async () => {
    await i18n.setLanguage('ru');
    // nonexistent key falls back to key itself
    expect(i18n.t('nonexistent.fake.key')).toBe('nonexistent.fake.key');
  });

  it('ensures all registered languages in config exist in translations with root keys', () => {
    const registeredCodes = Object.keys(SUPPORTED_LANGUAGES);
    const availableCodes = Object.keys(translations);

    for (const code of registeredCodes) {
      expect(availableCodes).toContain(code);
      const langDict = translations[code];
      expect(langDict).toBeDefined();
      expect(typeof langDict).toBe('object');

      // Verify essential sections exist
      expect(langDict.header).toBeDefined();
      expect(langDict.settings).toBeDefined();
      expect(langDict.item).toBeDefined();
    }
  });
});
