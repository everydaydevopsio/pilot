import { formatStyles } from '../../../src/browser/inspect/styles.js';
import type { StylesResult } from '../../../src/browser/inspect/styles.js';

describe('formatStyles', () => {
  it('formats empty computed styles', () => {
    const result: StylesResult = {
      ref: 'e1',
      computed: {},
      matched: []
    };
    const text = formatStyles(result);
    expect(text).toContain('Styles for e1');
    expect(text).toContain('(none)');
  });

  it('formats computed styles sorted alphabetically', () => {
    const result: StylesResult = {
      ref: 'e2',
      computed: {
        'z-index': 'auto',
        display: 'flex',
        color: 'rgb(0, 0, 0)'
      },
      matched: []
    };
    const text = formatStyles(result);
    const lines = text.split('\n');
    const propLines = lines.filter(
      (l) => l.startsWith('  ') && l.includes(':')
    );
    expect(propLines[0]).toContain('color:');
    expect(propLines[1]).toContain('display:');
    expect(propLines[2]).toContain('z-index:');
  });

  it('formats box model', () => {
    const result: StylesResult = {
      ref: 'e3',
      computed: { display: 'block' },
      matched: [],
      boxModel: {
        content: { x: 10, y: 20, width: 100, height: 50 },
        padding: { top: 5, right: 5, bottom: 5, left: 5 },
        border: { top: 1, right: 1, bottom: 1, left: 1 },
        margin: { top: 10, right: 0, bottom: 10, left: 0 },
        width: 122,
        height: 82
      }
    };
    const text = formatStyles(result);
    expect(text).toContain('Box Model:');
    expect(text).toContain('content: 100x50 at (10, 20)');
    expect(text).toContain('padding: 5 5 5 5');
    expect(text).toContain('border: 1 1 1 1');
    expect(text).toContain('margin: 10 0 10 0');
    expect(text).toContain('total: 122x82');
  });

  it('omits box model section when not available', () => {
    const result: StylesResult = {
      ref: 'e4',
      computed: { display: 'none' },
      matched: []
    };
    const text = formatStyles(result);
    expect(text).not.toContain('Box Model:');
  });

  it('formats matched CSS rules with sorted properties', () => {
    const result: StylesResult = {
      ref: 'e5',
      computed: {},
      matched: [
        {
          selector: '.btn',
          source: 'regular',
          properties: { display: 'inline-block', padding: '8px 16px' }
        },
        {
          selector: '#main .btn',
          source: 'regular',
          properties: { color: 'white' }
        }
      ]
    };
    const text = formatStyles(result);
    expect(text).toContain('Matched Rules:');
    expect(text).toContain('.btn (regular):');
    expect(text).toContain('#main .btn (regular):');
    expect(text).toContain('display: inline-block');
    expect(text).toContain('color: white');
  });

  it('omits matched rules section when empty', () => {
    const result: StylesResult = {
      ref: 'e6',
      computed: { display: 'block' },
      matched: []
    };
    const text = formatStyles(result);
    expect(text).not.toContain('Matched Rules:');
  });
});
