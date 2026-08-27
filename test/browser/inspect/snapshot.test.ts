import {
  formatSnapshot,
  findElements
} from '../../../src/browser/inspect/snapshot.js';
import type { SnapshotResult } from '../../../src/browser/inspect/types.js';

describe('formatSnapshot', () => {
  it('formats empty snapshot', () => {
    const snapshot: SnapshotResult = {
      url: 'https://example.com',
      title: 'Test',
      timestamp: 0,
      elements: []
    };
    const text = formatSnapshot(snapshot);
    expect(text).toContain('Test');
    expect(text).toContain('https://example.com');
    expect(text).toContain('No interactive elements found');
  });

  it('formats elements with refs and roles', () => {
    const snapshot: SnapshotResult = {
      url: 'https://example.com',
      title: 'Test',
      timestamp: 0,
      elements: [
        {
          ref: 'e1',
          role: 'button',
          name: 'Submit',
          tag: 'button',
          visible: true
        },
        {
          ref: 'e2',
          role: 'textbox',
          name: 'Email',
          tag: 'input',
          type: 'email',
          visible: true
        }
      ]
    };
    const text = formatSnapshot(snapshot);
    expect(text).toContain('[e1] button "Submit"');
    expect(text).toContain('[e2] textbox "Email"');
    expect(text).toContain('type=email');
    expect(text).toContain('Elements (2)');
  });

  it('shows checked/unchecked state', () => {
    const snapshot: SnapshotResult = {
      url: 'about:blank',
      title: '',
      timestamp: 0,
      elements: [
        {
          ref: 'e1',
          role: 'checkbox',
          name: 'Agree',
          tag: 'input',
          type: 'checkbox',
          checked: true,
          visible: true
        },
        {
          ref: 'e2',
          role: 'checkbox',
          name: 'Newsletter',
          tag: 'input',
          type: 'checkbox',
          checked: false,
          visible: true
        }
      ]
    };
    const text = formatSnapshot(snapshot);
    expect(text).toContain('checked');
    expect(text).toContain('unchecked');
  });

  it('shows disabled and hidden state', () => {
    const snapshot: SnapshotResult = {
      url: 'about:blank',
      title: '',
      timestamp: 0,
      elements: [
        {
          ref: 'e1',
          role: 'button',
          name: 'Disabled',
          tag: 'button',
          disabled: true,
          visible: true
        },
        {
          ref: 'e2',
          role: 'link',
          name: 'Hidden',
          tag: 'a',
          visible: false
        }
      ]
    };
    const text = formatSnapshot(snapshot);
    expect(text).toContain('disabled');
    expect(text).toContain('hidden');
  });

  it('shows value for form controls', () => {
    const snapshot: SnapshotResult = {
      url: 'about:blank',
      title: '',
      timestamp: 0,
      elements: [
        {
          ref: 'e1',
          role: 'textbox',
          name: 'Name',
          tag: 'input',
          value: 'John',
          visible: true
        }
      ]
    };
    const text = formatSnapshot(snapshot);
    expect(text).toContain('value="John"');
  });

  it('shows heading level', () => {
    const snapshot: SnapshotResult = {
      url: 'about:blank',
      title: '',
      timestamp: 0,
      elements: [
        {
          ref: 'e1',
          role: 'heading',
          name: 'Title',
          tag: 'h1',
          level: 1,
          visible: true
        }
      ]
    };
    const text = formatSnapshot(snapshot);
    expect(text).toContain('level=1');
  });
});

describe('findElements', () => {
  const snapshot: SnapshotResult = {
    url: 'about:blank',
    title: '',
    timestamp: 0,
    elements: [
      {
        ref: 'e1',
        role: 'button',
        name: 'Submit',
        tag: 'button',
        visible: true
      },
      {
        ref: 'e2',
        role: 'button',
        name: 'Cancel',
        tag: 'button',
        visible: true
      },
      {
        ref: 'e3',
        role: 'textbox',
        name: 'Email',
        tag: 'input',
        type: 'email',
        value: 'user@test.com',
        visible: true
      },
      {
        ref: 'e4',
        role: 'link',
        name: 'Help',
        tag: 'a',
        description: 'Opens help page',
        visible: true
      },
      {
        ref: 'e5',
        role: 'heading',
        name: 'Contact Form',
        tag: 'h1',
        level: 1,
        visible: true
      }
    ]
  };

  it('filters by role', () => {
    const results = findElements(snapshot, { role: 'button' });
    expect(results).toHaveLength(2);
    expect(results.map((e) => e.ref)).toEqual(['e1', 'e2']);
  });

  it('filters by name (substring, case-insensitive)', () => {
    const results = findElements(snapshot, { name: 'sub' });
    expect(results).toHaveLength(1);
    expect(results[0].ref).toBe('e1');
  });

  it('filters by text matching name', () => {
    const results = findElements(snapshot, { text: 'cancel' });
    expect(results).toHaveLength(1);
    expect(results[0].ref).toBe('e2');
  });

  it('filters by text matching value', () => {
    const results = findElements(snapshot, { text: 'user@test' });
    expect(results).toHaveLength(1);
    expect(results[0].ref).toBe('e3');
  });

  it('filters by text matching description', () => {
    const results = findElements(snapshot, { text: 'help page' });
    expect(results).toHaveLength(1);
    expect(results[0].ref).toBe('e4');
  });

  it('combines role and name filters', () => {
    const results = findElements(snapshot, { role: 'button', name: 'Cancel' });
    expect(results).toHaveLength(1);
    expect(results[0].ref).toBe('e2');
  });

  it('returns empty array when nothing matches', () => {
    const results = findElements(snapshot, { role: 'slider' });
    expect(results).toHaveLength(0);
  });

  it('returns all elements when no filters specified', () => {
    const results = findElements(snapshot, {});
    expect(results).toHaveLength(5);
  });

  it('role filter is case-insensitive', () => {
    const results = findElements(snapshot, { role: 'BUTTON' });
    expect(results).toHaveLength(2);
  });
});
