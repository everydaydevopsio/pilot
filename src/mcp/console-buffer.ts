export type ConsoleLevel = 'log' | 'warn' | 'error' | 'info' | 'debug';

export interface StackFrame {
  url: string;
  functionName: string;
  lineNumber: number;
  columnNumber: number;
}

export interface ConsoleMessage {
  level: ConsoleLevel;
  text: string;
  url: string;
  lineNumber: number;
  columnNumber?: number;
  timestamp: number;
  stackFrames?: StackFrame[];
  isException?: boolean;
}

export interface ConsoleFilter {
  level?: ConsoleLevel | ConsoleLevel[];
  sinceMs?: number;
  limit?: number;
}

export class ConsoleBuffer {
  private buffer: ConsoleMessage[] = [];
  private head = 0;
  private count = 0;

  constructor(private readonly maxSize: number = 1000) {}

  push(msg: ConsoleMessage): void {
    if (this.count < this.maxSize) {
      this.buffer.push(msg);
      this.count++;
    } else {
      this.buffer[this.head] = msg;
      this.head = (this.head + 1) % this.maxSize;
    }
  }

  getAll(filter?: ConsoleFilter): ConsoleMessage[] {
    const messages = this.toArray();
    return this.applyFilter(messages, filter);
  }

  getErrors(sinceMs?: number): ConsoleMessage[] {
    return this.getAll({
      level: 'error',
      sinceMs
    });
  }

  clear(): number {
    const cleared = this.count;
    this.buffer = [];
    this.head = 0;
    this.count = 0;
    return cleared;
  }

  size(): number {
    return this.count;
  }

  private toArray(): ConsoleMessage[] {
    if (this.count < this.maxSize) {
      return [...this.buffer];
    }
    return [
      ...this.buffer.slice(this.head),
      ...this.buffer.slice(0, this.head)
    ];
  }

  private applyFilter(
    messages: ConsoleMessage[],
    filter?: ConsoleFilter
  ): ConsoleMessage[] {
    if (!filter) return messages;

    let result = messages;

    if (filter.level) {
      const levels = Array.isArray(filter.level)
        ? filter.level
        : [filter.level];
      result = result.filter((m) => levels.includes(m.level));
    }

    if (filter.sinceMs !== undefined) {
      const cutoff = Date.now() - filter.sinceMs;
      result = result.filter((m) => m.timestamp >= cutoff);
    }

    if (filter.limit !== undefined && result.length > filter.limit) {
      result = result.slice(-filter.limit);
    }

    return result;
  }
}
