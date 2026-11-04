/**
 * WebDriver key values for input.performActions. Named keys use the
 * WebDriver "normalized key value" code points; printable keys are sent as
 * the character itself.
 */

const NAMED_KEYS: Record<string, { key: string; value: string }> = {
  enter: { key: 'Enter', value: '' },
  tab: { key: 'Tab', value: '' },
  escape: { key: 'Escape', value: '' },
  backspace: { key: 'Backspace', value: '' },
  delete: { key: 'Delete', value: '' },
  space: { key: ' ', value: ' ' },
  arrowup: { key: 'ArrowUp', value: '' },
  arrowdown: { key: 'ArrowDown', value: '' },
  arrowleft: { key: 'ArrowLeft', value: '' },
  arrowright: { key: 'ArrowRight', value: '' },
  home: { key: 'Home', value: '' },
  end: { key: 'End', value: '' },
  pageup: { key: 'PageUp', value: '' },
  pagedown: { key: 'PageDown', value: '' }
};

for (let i = 1; i <= 12; i++) {
  NAMED_KEYS[`f${i}`] = {
    key: `F${i}`,
    value: String.fromCharCode(0xe031 + i - 1)
  };
}

const MODIFIER_KEYS: Record<string, string> = {
  alt: '',
  control: '',
  ctrl: '',
  meta: '',
  cmd: '',
  command: '',
  shift: ''
};

export const ENTER_KEY = NAMED_KEYS.enter.value;
export const BACKSPACE_KEY = NAMED_KEYS.backspace.value;

export interface KeyCombo {
  /** DOM key name reported back to the caller, e.g. "Enter" or "a". */
  key: string;
  /** Modifier names as the caller wrote them. */
  modifierNames: string[];
  /** WebDriver values: modifiers first, then the key. */
  values: string[];
}

/**
 * Parse "Control+a", "Meta+Shift+Enter", or "Tab" the same way the CDP
 * press_key command does: the last segment is the key, the rest are
 * modifiers, and unknown modifiers are ignored.
 */
export function parseKeyCombo(input: string): KeyCombo {
  const parts = input.split('+');
  const keyPart = parts.pop()!;
  const modifierNames: string[] = [];
  const values: string[] = [];

  for (const mod of parts) {
    const value = MODIFIER_KEYS[mod.toLowerCase()];
    if (value) {
      modifierNames.push(mod);
      values.push(value);
    }
  }

  const named = NAMED_KEYS[keyPart.toLowerCase()];
  if (named) {
    values.push(named.value);
    return { key: named.key, modifierNames, values };
  }

  // Single characters and unknown names pass through as the key value.
  values.push(keyPart);
  return { key: keyPart, modifierNames, values };
}

type KeyAction = { type: 'keyDown' | 'keyUp'; value: string };

/** Key actions that press every value in order and release them in reverse. */
export function chordActions(values: string[]): KeyAction[] {
  return [
    ...values.map((value) => ({ type: 'keyDown' as const, value })),
    ...[...values].reverse().map((value) => ({ type: 'keyUp' as const, value }))
  ];
}

/** Key actions that type text one character at a time. */
export function textActions(text: string): KeyAction[] {
  const actions: KeyAction[] = [];
  for (const char of text) {
    const value = char === '\n' || char === '\r' ? ENTER_KEY : char;
    actions.push({ type: 'keyDown', value }, { type: 'keyUp', value });
  }
  return actions;
}
