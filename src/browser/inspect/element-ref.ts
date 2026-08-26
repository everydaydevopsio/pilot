import type { StaleElementError } from './types.js';

interface RefEntry {
  backendNodeId: number;
}

export class ElementRefMap {
  private generation = 0;
  private refs = new Map<string, RefEntry>();
  private counter = 0;

  getGeneration(): number {
    return this.generation;
  }

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

  resolve(ref: string): number {
    const entry = this.refs.get(ref);
    if (!entry) {
      throw this.staleError(ref);
    }
    return entry.backendNodeId;
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
