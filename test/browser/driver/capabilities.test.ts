import {
  CapabilityError,
  TOOL_CAPABILITIES,
  assertToolSupported,
  missingCapabilities,
  unsupportedTools
} from '../../../src/browser/driver/capabilities.js';
import {
  CAPABILITIES,
  type Capability
} from '../../../src/browser/driver/types.js';
import { EXPECTED_TOOLS } from '../../../src/mcp/tools/names.js';

const ALL = new Set<Capability>(CAPABILITIES);
const NONE = new Set<Capability>();

// #62 AC3: every tool declares the capabilities it needs.
describe('TOOL_CAPABILITIES', () => {
  it('declares every registered tool and nothing else', () => {
    expect(Object.keys(TOOL_CAPABILITIES).sort()).toEqual(
      [...EXPECTED_TOOLS].sort()
    );
  });

  it('only references known capabilities', () => {
    for (const caps of Object.values(TOOL_CAPABILITIES)) {
      for (const cap of caps) expect(CAPABILITIES).toContain(cap);
    }
  });

  it('requires nothing for session management tools', () => {
    for (const tool of [
      'browser_start',
      'browser_stop',
      'browser_status',
      'browser_stop_all'
    ] as const) {
      expect(TOOL_CAPABILITIES[tool]).toEqual([]);
    }
  });

  it('uses every capability in at least one tool', () => {
    const used = new Set(Object.values(TOOL_CAPABILITIES).flat());
    expect([...used].sort()).toEqual([...CAPABILITIES].sort());
  });
});

describe('missingCapabilities', () => {
  it('returns nothing when the driver has every capability', () => {
    expect(missingCapabilities('browser_performance', ALL)).toEqual([]);
  });

  it('lists the capabilities the driver lacks', () => {
    expect(missingCapabilities('browser_performance', NONE)).toEqual([
      'performanceTrace'
    ]);
  });
});

describe('assertToolSupported', () => {
  it('passes for a supported tool', () => {
    expect(() =>
      assertToolSupported('browser_click', {
        kind: 'chrome',
        capabilities: ALL
      })
    ).not.toThrow();
  });

  it('throws a CapabilityError naming the tool, browser, and gap', () => {
    const caps = new Set<Capability>(
      CAPABILITIES.filter((c) => c !== 'network')
    );
    let error: unknown;
    try {
      assertToolSupported('browser_network', {
        kind: 'safari',
        capabilities: caps
      });
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(CapabilityError);
    const capError = error as CapabilityError;
    expect(capError.message).toBe(
      'browser_network is not supported by safari (missing capabilities: network).'
    );
    expect(capError.tool).toBe('browser_network');
    expect(capError.browser).toBe('safari');
    expect(capError.missing).toEqual(['network']);
    expect(capError.name).toBe('CapabilityError');
  });
});

describe('unsupportedTools', () => {
  it('is empty for a driver with every capability', () => {
    expect(unsupportedTools(ALL)).toEqual([]);
  });

  it('lists every tool that needs a capability when the driver has none', () => {
    const tools = unsupportedTools(NONE);
    expect(tools).toContain('browser_click');
    expect(tools).toContain('browser_performance');
    expect(tools).not.toContain('browser_start');
    expect(tools).not.toContain('browser_status');
  });

  it('lists only the tools that need a missing capability', () => {
    const caps = new Set<Capability>(
      CAPABILITIES.filter((c) => c !== 'performanceTrace' && c !== 'styles')
    );
    expect(unsupportedTools(caps).sort()).toEqual([
      'browser_performance',
      'browser_styles'
    ]);
  });
});
