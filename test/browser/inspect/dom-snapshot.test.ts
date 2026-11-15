// #58: the JS-injected snapshot used by drivers without an accessibility tree.
import {
  DOM_SNAPSHOT_FUNCTION,
  toElementInfo
} from '../../../src/browser/inspect/dom-snapshot.js';
import { ElementRefMap } from '../../../src/browser/inspect/element-ref.js';

describe('DOM snapshot', () => {
  it('is a plain function declaration the page can run', () => {
    expect(DOM_SNAPSHOT_FUNCTION.startsWith('function () {')).toBe(true);
    expect(
      () => new Function(`return (${DOM_SNAPSHOT_FUNCTION})`)
    ).not.toThrow();
  });

  it('turns page data into ElementInfo with only the fields present', () => {
    expect(
      toElementInfo('e1', {
        role: 'checkbox',
        name: 'Agree',
        tag: 'input',
        type: 'checkbox',
        visible: true,
        checked: false,
        disabled: true,
        required: true,
        selected: true,
        expanded: false,
        level: 2,
        value: 'v',
        description: 'More',
        bounds: { x: 1, y: 2, width: 3, height: 4 }
      })
    ).toEqual({
      ref: 'e1',
      role: 'checkbox',
      name: 'Agree',
      tag: 'input',
      type: 'checkbox',
      visible: true,
      checked: false,
      disabled: true,
      required: true,
      selected: true,
      expanded: false,
      level: 2,
      value: 'v',
      description: 'More',
      bounds: { x: 1, y: 2, width: 3, height: 4 }
    });
    expect(toElementInfo('e2', undefined)).toEqual({
      ref: 'e2',
      role: '',
      name: '',
      tag: '',
      visible: false
    });
  });
});

describe('ElementRefMap shared ids', () => {
  it('stores BiDi shared ids separately from CDP node ids', () => {
    const map = new ElementRefMap();
    map.setShared('e1', 'shared-1');
    map.set('e2', 42);
    expect(map.resolveShared('e1')).toBe('shared-1');
    expect(map.resolve('e2')).toBe(42);
    expect(() => map.resolve('e1')).toThrow(/stale/);
    expect(() => map.resolveShared('e2')).toThrow(/stale/);
    expect(map.stale('e9')).toMatchObject({
      code: 'STALE_ELEMENT_REFERENCE',
      ref: 'e9'
    });
  });
});
