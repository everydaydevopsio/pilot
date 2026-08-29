import { redactHeaders } from '../../../src/browser/network/redaction.js';

describe('redactHeaders', () => {
  it('redacts Authorization header', () => {
    const result = redactHeaders({ Authorization: 'Bearer token123' });
    expect(result.Authorization).toBe('[REDACTED]');
  });

  it('redacts Cookie header', () => {
    const result = redactHeaders({ Cookie: 'session=abc' });
    expect(result.Cookie).toBe('[REDACTED]');
  });

  it('redacts Set-Cookie header', () => {
    const result = redactHeaders({ 'Set-Cookie': 'id=xyz' });
    expect(result['Set-Cookie']).toBe('[REDACTED]');
  });

  it('redacts X-Api-Key header', () => {
    const result = redactHeaders({ 'X-Api-Key': 'key123' });
    expect(result['X-Api-Key']).toBe('[REDACTED]');
  });

  it('redacts Proxy-Authorization header', () => {
    const result = redactHeaders({ 'Proxy-Authorization': 'Basic abc' });
    expect(result['Proxy-Authorization']).toBe('[REDACTED]');
  });

  it('is case-insensitive', () => {
    const result = redactHeaders({ authorization: 'Bearer x' });
    expect(result.authorization).toBe('[REDACTED]');
  });

  it('preserves non-sensitive headers', () => {
    const result = redactHeaders({
      'Content-Type': 'application/json',
      Accept: 'text/html'
    });
    expect(result['Content-Type']).toBe('application/json');
    expect(result.Accept).toBe('text/html');
  });

  it('handles empty headers', () => {
    expect(redactHeaders({})).toEqual({});
  });

  it('redacts mixed headers correctly', () => {
    const result = redactHeaders({
      Authorization: 'Bearer secret',
      'Content-Type': 'application/json',
      Cookie: 'session=abc',
      Accept: '*/*'
    });
    expect(result.Authorization).toBe('[REDACTED]');
    expect(result['Content-Type']).toBe('application/json');
    expect(result.Cookie).toBe('[REDACTED]');
    expect(result.Accept).toBe('*/*');
  });
});
