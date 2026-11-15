import type { StaleElementError } from './types.js';

/**
 * A ref points at a CDP backend node id (Chrome) or a WebDriver BiDi shared
 * node id (Firefox); each driver only stores and resolves its own kind.
 */
type RefEntry = { backendNodeId: number } | { sharedId: string };

export class ElementRefMap {
  private generation = 0;
  private refs = new Map<string, RefEntry>();
  private counter = 0;

  getGeneration(): number {
    return this.generation;
  }

  /**
   * Clear refs for a new snapshot within the same document.
   * Does not increment generation.
   */
  resetRefs(): void {
    this.refs.clear();
    this.counter = 0;
  }

  /**
   * Invalidate all refs due to navigation or DOM replacement.
   * Increments generation so stale refs are detected.
   */
  invalidate(): void {
    this.refs.clear();
    this.counter = 0;
    this.generation++;
  }

  nextRef(): string {
    this.counter++;
    return `e${this.counter}`;
  }

  set(ref: string, backendNodeId: number): void {
    this.refs.set(ref, { backendNodeId });
  }

  setShared(ref: string, sharedId: string): void {
    this.refs.set(ref, { sharedId });
  }

  resolve(ref: string): number {
    const entry = this.refs.get(ref);
    if (!entry || !('backendNodeId' in entry)) {
      throw this.staleError(ref);
    }
    return entry.backendNodeId;
  }

  resolveShared(ref: string): string {
    const entry = this.refs.get(ref);
    if (!entry || !('sharedId' in entry)) {
      throw this.staleError(ref);
    }
    return entry.sharedId;
  }

  /** The stale-ref error, for drivers that detect staleness in the page. */
  stale(ref: string): Error {
    return this.staleError(ref);
  }

  has(ref: string): boolean {
    return this.refs.has(ref);
  }

  size(): number {
    return this.refs.size;
  }

  private staleError(ref: string): StaleElementError & Error {
    const err = new Error(
      `Element ref "${ref}" is stale. The page has navigated or the DOM has been replaced. Take a new snapshot to get fresh refs.`
    ) as StaleElementError & Error;
    err.code = 'STALE_ELEMENT_REFERENCE';
    err.ref = ref;
    return err;
  }
}
