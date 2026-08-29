const DEFAULT_REDACT_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key'
]);

let customRedactHeaders: Set<string> | null = null;

export function getRedactHeaders(): Set<string> {
  if (customRedactHeaders) return customRedactHeaders;

  const env = process.env.PILOT_REDACT_HEADERS;
  if (env) {
    customRedactHeaders = new Set(
      env.split(',').map((h) => h.trim().toLowerCase())
    );
    // Merge with defaults
    for (const h of DEFAULT_REDACT_HEADERS) {
      customRedactHeaders.add(h);
    }
    return customRedactHeaders;
  }

  return DEFAULT_REDACT_HEADERS;
}

export function redactHeaders(
  headers: Record<string, string>
): Record<string, string> {
  const redactSet = getRedactHeaders();
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (redactSet.has(key.toLowerCase())) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = value;
    }
  }
  return result;
}
