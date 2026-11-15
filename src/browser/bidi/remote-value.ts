/**
 * Helpers for WebDriver BiDi script values. BiDi serializes results as typed
 * RemoteValues instead of the JSON values CDP returns with returnByValue, so
 * these convert them back to plain JSON for the MCP tools.
 */

export interface RemoteValue {
  type: string;
  value?: unknown;
  sharedId?: string;
  handle?: string;
}

export type LocalValue =
  | { type: 'undefined' }
  | { type: 'null' }
  | { type: 'string'; value: string }
  | { type: 'number'; value: number | string }
  | { type: 'boolean'; value: boolean }
  | { type: 'array'; value: LocalValue[] }
  | { type: 'object'; value: Array<[string, LocalValue]> }
  | { sharedId: string };

/** Serialize a JSON-compatible value as a BiDi LocalValue argument. */
export function toLocalValue(value: unknown): LocalValue {
  if (value === undefined) return { type: 'undefined' };
  if (value === null) return { type: 'null' };
  if (typeof value === 'string') return { type: 'string', value };
  if (typeof value === 'boolean') return { type: 'boolean', value };
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return { type: 'number', value: 'NaN' };
    if (value === Infinity) return { type: 'number', value: 'Infinity' };
    if (value === -Infinity) return { type: 'number', value: '-Infinity' };
    if (Object.is(value, -0)) return { type: 'number', value: '-0' };
    return { type: 'number', value };
  }
  if (Array.isArray(value)) {
    return { type: 'array', value: value.map(toLocalValue) };
  }
  if (typeof value === 'object') {
    return {
      type: 'object',
      value: Object.entries(value as Record<string, unknown>).map(
        ([k, v]) => [k, toLocalValue(v)] as [string, LocalValue]
      )
    };
  }
  return { type: 'string', value: String(value) };
}

function deserializeNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  switch (value) {
    case 'NaN':
      return NaN;
    case 'Infinity':
      return Infinity;
    case '-Infinity':
      return -Infinity;
    case '-0':
      return -0;
    default:
      return Number(value);
  }
}

/**
 * Convert a RemoteValue to the JSON value CDP's returnByValue would produce.
 * Values with no JSON form (functions, nodes, windows) become undefined in
 * objects and null in arrays, matching JSON.stringify.
 */
export function deserialize(remote: RemoteValue | undefined): unknown {
  if (!remote) return undefined;
  switch (remote.type) {
    case 'undefined':
      return undefined;
    case 'null':
      return null;
    case 'string':
    case 'boolean':
      return remote.value;
    case 'number':
      return deserializeNumber(remote.value);
    case 'bigint':
      return String(remote.value);
    case 'date':
      return String(remote.value);
    case 'regexp':
      return {};
    case 'array':
    case 'set':
      return Array.isArray(remote.value)
        ? (remote.value as RemoteValue[]).map((v) => deserialize(v) ?? null)
        : [];
    case 'object':
    case 'map': {
      const out: Record<string, unknown> = {};
      if (Array.isArray(remote.value)) {
        for (const entry of remote.value as Array<
          [string | RemoteValue, RemoteValue]
        >) {
          const [key, val] = entry;
          const name =
            typeof key === 'string' ? key : String(deserialize(key) ?? '');
          const v = deserialize(val);
          if (v !== undefined) out[name] = v;
        }
      }
      return out;
    }
    default:
      return undefined;
  }
}

/** The CDP RemoteObject type name for a BiDi value type. */
export function cdpTypeOf(remote: RemoteValue | undefined): string {
  switch (remote?.type) {
    case undefined:
    case 'undefined':
      return 'undefined';
    case 'string':
    case 'number':
    case 'boolean':
    case 'bigint':
    case 'symbol':
    case 'function':
      return remote.type;
    default:
      return 'object';
  }
}

export interface EvaluateSuccess {
  type: 'success';
  result: RemoteValue;
}

export interface EvaluateException {
  type: 'exception';
  exceptionDetails: {
    text?: string;
    exception?: RemoteValue;
    lineNumber?: number;
    columnNumber?: number;
  };
}

export type EvaluateResultMessage = EvaluateSuccess | EvaluateException;

/** The message to show for a script exception. */
export function exceptionText(details: EvaluateException['exceptionDetails']) {
  return details.text || 'evaluation error';
}
