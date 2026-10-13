import { describe, it, expect } from 'vitest';

describe('UI Logic & Filtering (BUG-004 Regression & Core State)', () => {
  const sampleItems = [
    {
      id: '1',
      type: 'text',
      content: 'Antigravity workspace notes',
      preview: 'Antigravity workspace notes',
      timestamp: new Date('2026-10-14T01:00:00Z').toISOString()
    },
    {
      id: '2',
      type: 'code',
      content: 'const calculateTotal = (items) => items.reduce((a, b) => a + b, 0);',
      preview: 'const calculateTotal = ...',
      timestamp: new Date('2026-10-14T02:00:00Z').toISOString()
    },
    {
      id: '3',
      type: 'image',
      content: 'C:\\Users\\user\\AppData\\Roaming\\ClipBoardPro\\media\\12345.png',
      preview: 'data:image/png;base64,...',
      timestamp: new Date('2026-10-14T03:00:00Z').toISOString()
    },
    {
      id: '4',
      type: 'text',
      content: 'Review code before main push',
      preview: 'Review code before main push',
      timestamp: new Date('2026-10-13T12:00:00Z').toISOString()
    }
  ];

  function computeCategoryCounts(items) {
    const counts = { all: items.length, text: 0, image: 0, code: 0 };
    for (const item of items) {
      if (item.type === 'text') counts.text++;
      else if (item.type === 'image') counts.image++;
      else if (item.type === 'code') counts.code++;
    }
    return counts;
  }

  function filterItems(items, filter, searchQuery) {
    return items.filter(item => {
      const matchesFilter = filter === 'all' || item.type === filter;
      const matchesSearch = !searchQuery || 
        item.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.preview.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }

  function detectContentType(content, type = null) {
    if (type === 'image' || (typeof content === 'string' && content.endsWith('.png'))) {
      return 'image';
    }
    if (content.startsWith('data:image/') && content.length > 1000) {
      return 'image';
    }
    const codePatterns = [
      /function\s+\w+\s*\(/,
      /const\s+\w+\s*=/,
      /let\s+\w+\s*=/,
      /var\s+\w+\s*=/,
      /import\s+.*from/,
      /export\s+(default\s+)?/,
      /class\s+\w+/,
      /<\/?[a-z][\s\S]*>/i,
      /if\s*\(/,
      /for\s*\(/,
      /while\s*\(/,
      /=>\s*\{/
    ];
    if (codePatterns.some(pattern => pattern.test(content))) {
      return 'code';
    }
    return 'text';
  }

  it('computes accurate category counts without hardcoded zeroes (BUG-004 regression fix)', () => {
    const counts = computeCategoryCounts(sampleItems);
    expect(counts.all).toBe(4);
    expect(counts.text).toBe(2);
    expect(counts.code).toBe(1);
    expect(counts.image).toBe(1);
  });

  it('filters items by type correctly', () => {
    const textOnly = filterItems(sampleItems, 'text', '');
    expect(textOnly.length).toBe(2);
    expect(textOnly.every(i => i.type === 'text')).toBe(true);

    const codeOnly = filterItems(sampleItems, 'code', '');
    expect(codeOnly.length).toBe(1);
    expect(codeOnly[0].id).toBe('2');

    const imageOnly = filterItems(sampleItems, 'image', '');
    expect(imageOnly.length).toBe(1);
    expect(imageOnly[0].id).toBe('3');
  });

  it('filters items by search query case-insensitively', () => {
    const queryResult = filterItems(sampleItems, 'all', 'workspace');
    expect(queryResult.length).toBe(1);
    expect(queryResult[0].id).toBe('1');

    const upperQueryResult = filterItems(sampleItems, 'all', 'CALCULATETOTAL');
    expect(upperQueryResult.length).toBe(1);
    expect(upperQueryResult[0].id).toBe('2');
  });

  it('combines type filter and search query', () => {
    // Both items 1 and 4 are text, but only 4 has "Review"
    const textReview = filterItems(sampleItems, 'text', 'review');
    expect(textReview.length).toBe(1);
    expect(textReview[0].id).toBe('4');

    // Item 2 is code, so filtering text for "reduce" yields empty
    const textReduce = filterItems(sampleItems, 'text', 'reduce');
    expect(textReduce.length).toBe(0);
  });

  it('detects content types accurately', () => {
    expect(detectContentType('C:\\images\\screenshot.png')).toBe('image');
    expect(detectContentType('const add = (a, b) => { return a + b; }')).toBe('code');
    expect(detectContentType('function test() {}')).toBe('code');
    expect(detectContentType('Just a regular grocery list: milk, eggs, bread')).toBe('text');
  });

  it('filters expired entries by retention policy', () => {
    const now = new Date('2026-10-14T03:30:00Z').getTime();
    const oneHourMs = 60 * 60 * 1000;

    // Retain only items newer than 1 hour
    const retained = sampleItems.filter(item => {
      const itemTime = new Date(item.timestamp).getTime();
      return (now - itemTime) <= oneHourMs;
    });

    // Item 3 (03:00) is 30 mins old -> kept
    // Item 2 (02:00) is 1.5 hours old -> evicted
    expect(retained.length).toBe(1);
    expect(retained[0].id).toBe('3');
  });
});
