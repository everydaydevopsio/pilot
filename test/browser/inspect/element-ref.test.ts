import { ElementRefMap } from '../../../src/browser/inspect/element-ref.js';

describe('ElementRefMap', () => {
  let refMap: ElementRefMap;

  beforeEach(() => {
    refMap = new ElementRefMap();
  });

  it('starts at generation 0 with no refs', () => {
    expect(refMap.getGeneration()).toBe(0);
    expect(refMap.size()).toBe(0);
  });

  it('generates sequential ref IDs', () => {
    expect(refMap.nextRef()).toBe('e1');
    expect(refMap.nextRef()).toBe('e2');
    expect(refMap.nextRef()).toBe('e3');
  });

  it('stores and resolves refs', () => {
    const ref = refMap.nextRef();
    refMap.set(ref, 42);
    expect(refMap.resolve(ref)).toBe(42);
    expect(refMap.has(ref)).toBe(true);
    expect(refMap.size()).toBe(1);
  });

  it('throws STALE_ELEMENT_REFERENCE for unknown ref', () => {
    try {
      refMap.resolve('e99');
      fail('Expected error');
    } catch (err: unknown) {
      const e = err as Error & { code: string; ref: string };
      expect(e.code).toBe('STALE_ELEMENT_REFERENCE');
      expect(e.ref).toBe('e99');
      expect(e.message).toContain('stale');
    }
  });

  it('invalidate clears refs and increments generation', () => {
    refMap.set(refMap.nextRef(), 1);
    refMap.set(refMap.nextRef(), 2);
    expect(refMap.size()).toBe(2);
    expect(refMap.getGeneration()).toBe(0);

    refMap.invalidate();

    expect(refMap.size()).toBe(0);
    expect(refMap.getGeneration()).toBe(1);
  });

  it('old refs become stale after invalidation', () => {
    const ref = refMap.nextRef();
    refMap.set(ref, 42);
    expect(refMap.resolve(ref)).toBe(42);

    refMap.invalidate();

    try {
      refMap.resolve(ref);
      fail('Expected error');
    } catch (err: unknown) {
      const e = err as Error & { code: string };
      expect(e.code).toBe('STALE_ELEMENT_REFERENCE');
    }
  });

  it('resets counter after invalidation', () => {
    refMap.nextRef(); // e1
    refMap.nextRef(); // e2
    refMap.invalidate();
    expect(refMap.nextRef()).toBe('e1');
  });

  it('supports multiple generations', () => {
    refMap.invalidate();
    refMap.invalidate();
    refMap.invalidate();
    expect(refMap.getGeneration()).toBe(3);
  });

  it('resetRefs clears refs and counter without incrementing generation', () => {
    refMap.set(refMap.nextRef(), 1);
    refMap.set(refMap.nextRef(), 2);
    expect(refMap.size()).toBe(2);
    expect(refMap.getGeneration()).toBe(0);

    refMap.resetRefs();

    expect(refMap.size()).toBe(0);
    expect(refMap.getGeneration()).toBe(0);
    expect(refMap.nextRef()).toBe('e1');
  });

  it('resetRefs does not make old refs stale if not re-added', () => {
    const ref = refMap.nextRef();
    refMap.set(ref, 42);
    refMap.resetRefs();

    try {
      refMap.resolve(ref);
      fail('Expected error');
    } catch (err: unknown) {
      const e = err as Error & { code: string };
      expect(e.code).toBe('STALE_ELEMENT_REFERENCE');
    }
  });
});
