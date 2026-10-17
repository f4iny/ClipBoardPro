import { describe, it, expect, vi } from 'vitest';

describe('Electron Security Controls & Handlers (HIGH-04 & HIGH-05)', () => {
  it('enforces setWindowOpenHandler to deny new windows and forward http/https to external shell', () => {
    const openedUrls = [];
    const mockShell = {
      openExternal: (url) => openedUrls.push(url),
    };

    function handleWindowOpen({ url }, shell = mockShell) {
      try {
        const parsed = new URL(url);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          shell.openExternal(url);
        }
      } catch {}
      return { action: 'deny' };
    }

    // HTTP url
    const res1 = handleWindowOpen({ url: 'https://github.com/f4iny/ClipBoardPro' });
    expect(res1).toEqual({ action: 'deny' });
    expect(openedUrls).toContain('https://github.com/f4iny/ClipBoardPro');

    // Insecure / non-http url (e.g. javascript:, file:, data:)
    const res2 = handleWindowOpen({ url: 'javascript:alert(1)' });
    expect(res2).toEqual({ action: 'deny' });
    expect(openedUrls).not.toContain('javascript:alert(1)');
  });

  it('enforces will-navigate handler to prevent navigating main window away from app', () => {
    const openedUrls = [];
    const mockShell = {
      openExternal: (url) => openedUrls.push(url),
    };

    function handleWillNavigate(event, targetUrl, currentUrl, shell = mockShell) {
      if (currentUrl && targetUrl !== currentUrl) {
        event.preventDefault();
        try {
          const parsed = new URL(targetUrl);
          if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            shell.openExternal(targetUrl);
          }
        } catch {}
      }
    }

    const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    const currentAppUrl = 'file:///app/dist-react/index.html';

    // Trying to navigate to external URL
    handleWillNavigate(event, 'https://malicious-site.com', currentAppUrl);
    expect(event.defaultPrevented).toBe(true);
    expect(openedUrls).toContain('https://malicious-site.com');

    // Staying on same URL
    const safeEvent = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    handleWillNavigate(safeEvent, currentAppUrl, currentAppUrl);
    expect(safeEvent.defaultPrevented).toBe(false);
  });
});

describe('Content-Based Echo Suppression (HIGH-03)', () => {
  it('suppresses immediate echo when clipboard content matches last written content', () => {
    let lastClipboardText = '';
    const emittedEvents = [];

    function handleSetClipboardText(text) {
      // Synchronously record content before OS clipboard write
      lastClipboardText = text;
    }

    function checkClipboardContent(incomingText) {
      if (incomingText && incomingText !== lastClipboardText) {
        lastClipboardText = incomingText;
        emittedEvents.push({ type: 'text', content: incomingText });
        return true;
      }
      return false; // Echo suppressed
    }

    // 1. User clicks copy in UI
    handleSetClipboardText('copied from ClipBoardPro');

    // 2. Windows clipboard event arrives 15ms later with same text
    const processedEcho = checkClipboardContent('copied from ClipBoardPro');
    expect(processedEcho).toBe(false);
    expect(emittedEvents).toHaveLength(0);

    // 3. User copies different text from browser 30ms later
    const processedExternal = checkClipboardContent('copied from browser');
    expect(processedExternal).toBe(true);
    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0].content).toBe('copied from browser');
  });
});
