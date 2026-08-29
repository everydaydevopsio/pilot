import { DialogQueue } from '../../../src/browser/interaction/dialogs.js';

describe('DialogQueue', () => {
  let queue: DialogQueue;

  beforeEach(() => {
    queue = new DialogQueue();
  });

  it('starts empty', () => {
    expect(queue.size()).toBe(0);
    expect(queue.list()).toEqual([]);
  });

  it('pushes and lists dialogs', () => {
    queue.push({
      type: 'alert',
      message: 'Hello',
      timestamp: Date.now()
    });
    expect(queue.size()).toBe(1);
    expect(queue.list()[0].message).toBe('Hello');
  });

  it('shift removes and returns the first dialog', () => {
    queue.push({ type: 'alert', message: 'First', timestamp: 1 });
    queue.push({ type: 'confirm', message: 'Second', timestamp: 2 });

    const first = queue.shift();
    expect(first?.message).toBe('First');
    expect(queue.size()).toBe(1);
    expect(queue.list()[0].message).toBe('Second');
  });

  it('shift returns undefined when empty', () => {
    expect(queue.shift()).toBeUndefined();
  });

  it('preserves empty string defaultPrompt', () => {
    queue.push({
      type: 'prompt',
      message: 'Enter value',
      defaultPrompt: '',
      timestamp: Date.now()
    });
    expect(queue.list()[0].defaultPrompt).toBe('');
  });

  it('clear empties the queue', () => {
    queue.push({ type: 'alert', message: 'A', timestamp: 1 });
    queue.push({ type: 'alert', message: 'B', timestamp: 2 });
    queue.clear();
    expect(queue.size()).toBe(0);
  });
});
