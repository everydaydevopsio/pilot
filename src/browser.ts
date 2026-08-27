// Backward-compatible re-export from the refactored browser module.
// All public types, classes, and functions are now defined in src/browser/.
export {
  BrowserManager,
  PROFILE_NAME_RE,
  sandboxDecision,
  shouldDisableSandbox,
  resolveUserDataDir,
  extractLockPid,
  isProcessAlive,
  isProfileLocked,
  findChromeExecutable,
  findFreePort
} from './browser/index.js';

export type {
  BrowserEventCallback,
  TabInfo,
  BrowserState,
  LaunchOptions,
  SandboxDecision
} from './browser/index.js';
