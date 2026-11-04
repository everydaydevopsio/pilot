import { CapabilityError } from '../../src/browser/driver/capabilities.js';
import {
  CAPABILITIES,
  type BrowserDriver,
  type Capability
} from '../../src/browser/driver/types.js';
import {
  requireDriver,
  withCapabilityGate
} from '../../src/mcp/tools/driver-context.js';

function fakeDriver(
  capabilities: Capability[] = [...CAPABILITIES],
  connected = true
): BrowserDriver {
  return {
    kind: 'firefox',
    capabilities: new Set(capabilities),
    isConnected: () => connected
  } as unknown as BrowserDriver;
}

describe('requireDriver', () => {
  it('fails when no driver exists', () => {
    expect(() => requireDriver({ driver: null })).toThrow(
      'Browser not started. Call browser_start first.'
    );
  });

  it('fails when the driver is disconnected', () => {
    expect(() =>
      requireDriver({ driver: fakeDriver(undefined, false) })
    ).toThrow('Browser not started. Call browser_start first.');
  });

  it('returns a connected driver', () => {
    const driver = fakeDriver();
    expect(requireDriver({ driver })).toBe(driver);
  });
});

// #62 AC3: tools are gated on the active driver's capabilities.
describe('withCapabilityGate', () => {
  function setup(driver: BrowserDriver | null) {
    const target = { tool: jest.fn(), other: 'kept' };
    const gated = withCapabilityGate(target as never, () => driver);
    return { target, gated: gated as unknown as typeof target };
  }

  function registeredHandler(target: { tool: jest.Mock }) {
    const call = target.tool.mock.calls[0];
    return call[call.length - 1] as (...args: unknown[]) => Promise<unknown>;
  }

  it('passes non-tool properties through', () => {
    const { gated } = setup(null);
    expect(gated.other).toBe('kept');
  });

  it('rejects tools without a capability declaration', () => {
    const { gated } = setup(null);
    expect(() =>
      gated.tool('browser_unknown', 'desc', {}, async () => ({}))
    ).toThrow(
      'Tool browser_unknown has no entry in TOOL_CAPABILITIES; declare the driver capabilities it needs.'
    );
  });

  it('forwards the name, description, and shape unchanged', () => {
    const { target, gated } = setup(null);
    const shape = { a: 1 };
    gated.tool('browser_click', 'Click it', shape, async () => ({}));
    expect(target.tool).toHaveBeenCalledWith(
      'browser_click',
      'Click it',
      shape,
      expect.any(Function)
    );
  });

  it('runs the handler when no driver is active', async () => {
    const { target, gated } = setup(null);
    const handler = jest.fn().mockResolvedValue('ok');
    gated.tool('browser_click', 'd', {}, handler);
    await expect(registeredHandler(target)('arg')).resolves.toBe('ok');
    expect(handler).toHaveBeenCalledWith('arg');
  });

  it('runs the handler when the driver has the capabilities', async () => {
    const { target, gated } = setup(fakeDriver());
    const handler = jest.fn().mockResolvedValue('ok');
    gated.tool('browser_performance', 'd', {}, handler);
    await expect(registeredHandler(target)()).resolves.toBe('ok');
  });

  it('fails before the handler when a capability is missing', async () => {
    const { target, gated } = setup(
      fakeDriver(CAPABILITIES.filter((c) => c !== 'performanceTrace'))
    );
    const handler = jest.fn();
    gated.tool('browser_performance', 'd', {}, handler);
    await expect(registeredHandler(target)()).rejects.toThrow(CapabilityError);
    await expect(registeredHandler(target)()).rejects.toThrow(
      'browser_performance is not supported by firefox (missing capabilities: performanceTrace).'
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it('leaves registrations without a handler function alone', () => {
    const { target, gated } = setup(null);
    gated.tool('browser_click', 'd');
    expect(target.tool).toHaveBeenCalledWith('browser_click', 'd');
  });
});
