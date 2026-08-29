/**
 * Origin allow/block list evaluation.
 *
 * Rules:
 * - Block wins over allow.
 * - Both empty = everything allowed.
 * - Supports wildcard patterns: *.example.com matches sub.example.com
 * - Patterns with a scheme (https://...) match the full origin.
 * - Patterns without a scheme match the host (+port) only, any scheme.
 */

function getOriginList(envVar: string): string[] {
  const env = process.env[envVar];
  if (!env) return [];
  return env
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function patternToRegex(pattern: string): RegExp {
  // Escape regex special chars except *
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  // Replace * with regex wildcard
  const regexStr = escaped.replace(/\*/g, '.*');
  return new RegExp(`^${regexStr}$`, 'i');
}

function hasScheme(pattern: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(pattern);
}

function matchesPattern(
  origin: string,
  host: string,
  pattern: string
): boolean {
  if (hasScheme(pattern)) {
    // Pattern includes scheme — match against full origin
    return patternToRegex(pattern).test(origin);
  }
  // Scheme-less pattern — match against host (+port) only
  return patternToRegex(pattern).test(host);
}

function matchesAny(origin: string, host: string, patterns: string[]): boolean {
  return patterns.some((p) => matchesPattern(origin, host, p));
}

export function extractOrigin(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return url;
  }
}

export function extractHost(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host;
  } catch {
    return url;
  }
}

export interface OriginCheckResult {
  allowed: boolean;
  reason?: string;
}

export function checkOrigin(url: string): OriginCheckResult {
  const blocked = getOriginList('PILOT_BLOCKED_ORIGINS');
  const allowed = getOriginList('PILOT_ALLOWED_ORIGINS');

  // Both empty = everything allowed
  if (blocked.length === 0 && allowed.length === 0) {
    return { allowed: true };
  }

  const origin = extractOrigin(url);
  const host = extractHost(url);

  // Block wins over allow
  if (blocked.length > 0 && matchesAny(origin, host, blocked)) {
    return {
      allowed: false,
      reason: `Origin "${origin}" is blocked by PILOT_BLOCKED_ORIGINS`
    };
  }

  // If allow list exists, origin must match it
  if (allowed.length > 0 && !matchesAny(origin, host, allowed)) {
    return {
      allowed: false,
      reason: `Origin "${origin}" is not in PILOT_ALLOWED_ORIGINS`
    };
  }

  return { allowed: true };
}
