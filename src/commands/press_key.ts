import type { Client } from 'chrome-remote-interface';

/**
 * Map of named keys to CDP key event properties.
 */
const KEY_MAP: Record<
  string,
  { key: string; code: string; keyCode?: number; text?: string }
> = {
  enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  delete: { key: 'Delete', code: 'Delete', keyCode: 46 },
  space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
  arrowup: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  arrowdown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  arrowright: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  home: { key: 'Home', code: 'Home', keyCode: 36 },
  end: { key: 'End', code: 'End', keyCode: 35 },
  pageup: { key: 'PageUp', code: 'PageUp', keyCode: 33 },
  pagedown: { key: 'PageDown', code: 'PageDown', keyCode: 34 },
  f1: { key: 'F1', code: 'F1', keyCode: 112 },
  f2: { key: 'F2', code: 'F2', keyCode: 113 },
  f3: { key: 'F3', code: 'F3', keyCode: 114 },
  f4: { key: 'F4', code: 'F4', keyCode: 115 },
  f5: { key: 'F5', code: 'F5', keyCode: 116 },
  f6: { key: 'F6', code: 'F6', keyCode: 117 },
  f7: { key: 'F7', code: 'F7', keyCode: 118 },
  f8: { key: 'F8', code: 'F8', keyCode: 119 },
  f9: { key: 'F9', code: 'F9', keyCode: 120 },
  f10: { key: 'F10', code: 'F10', keyCode: 121 },
  f11: { key: 'F11', code: 'F11', keyCode: 122 },
  f12: { key: 'F12', code: 'F12', keyCode: 123 }
};

// CDP modifier bit flags
const MODIFIER_FLAGS: Record<string, number> = {
  alt: 1,
  control: 2,
  ctrl: 2,
  meta: 4,
  cmd: 4,
  command: 4,
  shift: 8
};

export interface PressKeyParams {
  key: string;
}

export interface PressKeyResult {
  key: string;
  modifiers: string[];
}

/**
 * Parse a key string like "Control+a", "Meta+Shift+Enter", or "Tab".
 */
function parseKeyCombo(input: string): {
  modifiers: number;
  modifierNames: string[];
  keyInfo: { key: string; code: string; keyCode?: number; text?: string };
} {
  const parts = input.split('+');
  let modifiers = 0;
  const modifierNames: string[] = [];

  // Last part is the actual key, everything before is a modifier
  const keyPart = parts.pop()!;

  for (const mod of parts) {
    const flag = MODIFIER_FLAGS[mod.toLowerCase()];
    if (flag) {
      modifiers |= flag;
      modifierNames.push(mod);
    }
  }

  // Look up the key in our map
  const mapped = KEY_MAP[keyPart.toLowerCase()];
  if (mapped) {
    return { modifiers, modifierNames, keyInfo: mapped };
  }

  // Single character key
  if (keyPart.length === 1) {
    const charCode = keyPart.charCodeAt(0);
    return {
      modifiers,
      modifierNames,
      keyInfo: {
        key: keyPart,
        code: `Key${keyPart.toUpperCase()}`,
        keyCode: charCode,
        text: modifiers === 0 ? keyPart : undefined
      }
    };
  }

  // Unknown named key — pass through
  return {
    modifiers,
    modifierNames,
    keyInfo: { key: keyPart, code: keyPart }
  };
}

export async function executePressKey(
  client: Client,
  params: PressKeyParams
): Promise<PressKeyResult> {
  const { modifiers, modifierNames, keyInfo } = parseKeyCombo(params.key);

  await client.Input.dispatchKeyEvent({
    type: 'keyDown',
    key: keyInfo.key,
    code: keyInfo.code,
    windowsVirtualKeyCode: keyInfo.keyCode,
    modifiers,
    ...(keyInfo.text && { text: keyInfo.text })
  });

  await client.Input.dispatchKeyEvent({
    type: 'keyUp',
    key: keyInfo.key,
    code: keyInfo.code,
    windowsVirtualKeyCode: keyInfo.keyCode,
    modifiers
  });

  return { key: keyInfo.key, modifiers: modifierNames };
}
