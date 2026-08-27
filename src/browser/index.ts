// Re-export all public types and classes from the browser module
export { BrowserManager } from './browser-manager.js';
export type {
  BrowserEventCallback,
  TabInfo,
  BrowserState,
  LaunchOptions,
  SandboxDecision
} from './types.js';
export {
  PROFILE_NAME_RE,
  sandboxDecision,
  shouldDisableSandbox,
  resolveUserDataDir,
  extractLockPid,
  isProcessAlive,
  isProfileLocked,
  findChromeExecutable,
  findFreePort
} from './chrome-launcher.js';
