import { formatConnectResult } from '../../src/commands/connect.js';
import type { ConnectResult } from '../../src/commands/connect.js';

describe('formatConnectResult', () => {
  it('formats connection with tabs', () => {
    const result: ConnectResult = {
      host: '127.0.0.1',
      port: 9222,
      tabs: [
        {
          targetId: 'tab-1',
          url: 'https://app.test/login',
          title: 'Login Page',
          active: true
        },
        {
          targetId: 'tab-2',
          url: 'https://app.test/dashboard',
          title: 'Dashboard',
          active: false
        }
      ]
    };
    const text = formatConnectResult(result);
    expect(text).toContain('Connected to Chrome at 127.0.0.1:9222');
    expect(text).toContain('Tabs (2)');
    expect(text).toContain('[tab-1] Login Page (active)');
    expect(text).toContain('[tab-2] Dashboard');
    expect(text).not.toContain('tab-2] Dashboard (active)');
  });

  it('formats connection with no title — shows URL', () => {
    const result: ConnectResult = {
      host: 'localhost',
      port: 9333,
      tabs: [
        {
          targetId: 'tab-1',
          url: 'about:blank',
          title: '',
          active: true
        }
      ]
    };
    const text = formatConnectResult(result);
    expect(text).toContain('Connected to Chrome at localhost:9333');
    expect(text).toContain('[tab-1] about:blank (active)');
  });

  it('formats empty tab list', () => {
    const result: ConnectResult = {
      host: '127.0.0.1',
      port: 9222,
      tabs: []
    };
    const text = formatConnectResult(result);
    expect(text).toContain('Tabs (0)');
  });
});
