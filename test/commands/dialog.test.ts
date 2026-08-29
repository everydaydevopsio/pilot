import { formatDialogResult } from '../../src/commands/dialog.js';
import type { DialogResult } from '../../src/commands/dialog.js';

describe('formatDialogResult', () => {
  it('formats empty dialog list', () => {
    const result: DialogResult = { action: 'list', dialogs: [] };
    expect(formatDialogResult(result)).toBe('No pending dialogs.');
  });

  it('formats dialog list with entries', () => {
    const result: DialogResult = {
      action: 'list',
      dialogs: [
        { type: 'alert', message: 'Warning!' },
        { type: 'prompt', message: 'Enter name', defaultPrompt: 'John' }
      ]
    };
    const text = formatDialogResult(result);
    expect(text).toContain('Pending dialogs (2)');
    expect(text).toContain('[alert] Warning!');
    expect(text).toContain('[prompt] Enter name (default: "John")');
  });

  it('formats accepted dialog', () => {
    const result: DialogResult = { action: 'accept', handled: true };
    expect(formatDialogResult(result)).toBe('Dialog accepted.');
  });

  it('formats dismissed dialog', () => {
    const result: DialogResult = { action: 'dismiss', handled: true };
    expect(formatDialogResult(result)).toBe('Dialog dismissed.');
  });

  it('formats no pending dialog', () => {
    const result: DialogResult = { action: 'accept', handled: false };
    expect(formatDialogResult(result)).toBe('No pending dialog to handle.');
  });
});
