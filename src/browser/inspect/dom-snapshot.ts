import type { ElementBounds, ElementInfo } from './types.js';

/**
 * Accessibility snapshot built by walking the DOM in the page, for drivers
 * whose protocol has no accessibility tree (WebDriver BiDi, WebKit). It
 * approximates Chrome's tree: implicit ARIA roles, a simplified accessible
 * name computation, and the same inclusion rules as snapshot.ts.
 *
 * The script is kept as a string, not a TypeScript function, so neither the
 * compiler nor coverage instrumentation rewrites code that runs in the page.
 * It returns [element, info] pairs; the driver turns each element into a
 * protocol handle and each info into an ElementInfo.
 */
export const DOM_SNAPSHOT_FUNCTION = String.raw`function () {
  var INTERACTIVE = new Set(['button', 'link', 'textbox', 'searchbox',
    'checkbox', 'radio', 'combobox', 'listbox', 'option', 'menuitem',
    'menuitemcheckbox', 'menuitemradio', 'tab', 'switch', 'slider',
    'spinbutton', 'treeitem']);
  var SEMANTIC = new Set(['heading', 'img', 'alert', 'dialog', 'alertdialog',
    'navigation', 'main', 'complementary', 'contentinfo', 'banner', 'form',
    'region', 'table', 'cell', 'row', 'columnheader', 'rowheader']);
  var NAME_FROM_CONTENT = new Set(['button', 'link', 'heading', 'option',
    'cell', 'columnheader', 'rowheader', 'tab', 'menuitem',
    'menuitemcheckbox', 'menuitemradio', 'treeitem', 'switch', 'checkbox',
    'radio']);
  var INPUT_ROLES = { button: 'button', submit: 'button', reset: 'button',
    image: 'button', file: 'button', color: 'button', checkbox: 'checkbox',
    radio: 'radio', range: 'slider', number: 'spinbutton', search: 'searchbox' };
  var LANDMARK_SCOPES = 'article, aside, main, nav, section';

  function text(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

  function implicitRole(el) {
    var tag = el.localName;
    switch (tag) {
      case 'a': case 'area': return el.hasAttribute('href') ? 'link' : '';
      case 'button': return 'button';
      case 'input': {
        var type = (el.getAttribute('type') || 'text').toLowerCase();
        if (type === 'hidden') return '';
        return INPUT_ROLES[type] || 'textbox';
      }
      case 'textarea': return 'textbox';
      case 'select':
        return el.multiple || el.size > 1 ? 'listbox' : 'combobox';
      case 'option': return 'option';
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
        return 'heading';
      case 'img': return el.getAttribute('alt') === '' ? 'presentation' : 'img';
      case 'nav': return 'navigation';
      case 'main': return 'main';
      case 'aside': return 'complementary';
      case 'header': return el.closest(LANDMARK_SCOPES) ? '' : 'banner';
      case 'footer': return el.closest(LANDMARK_SCOPES) ? '' : 'contentinfo';
      case 'form': return 'form';
      case 'section': return 'region';
      case 'dialog': return 'dialog';
      case 'table': return 'table';
      case 'tr': return 'row';
      case 'td': return 'cell';
      case 'th': return el.getAttribute('scope') === 'row' ? 'rowheader' : 'columnheader';
    }
    if (el.isContentEditable && el.getAttribute('contenteditable') !== null) {
      return 'textbox';
    }
    return '';
  }

  function roleOf(el) {
    var explicit = text(el.getAttribute('role')).split(' ')[0];
    return explicit || implicitRole(el);
  }

  function byIds(el, attr) {
    var ids = text(el.getAttribute(attr));
    if (!ids) return '';
    var root = el.getRootNode();
    return text(ids.split(' ').map(function (id) {
      var ref = root.getElementById ? root.getElementById(id) : null;
      return ref ? ref.textContent : '';
    }).join(' '));
  }

  function labelText(el) {
    var parts = [];
    if (el.labels) {
      for (var i = 0; i < el.labels.length; i++) {
        var clone = el.labels[i].cloneNode(true);
        clone.querySelectorAll('input, select, textarea, button').forEach(function (c) { c.remove(); });
        parts.push(clone.textContent);
      }
    }
    return text(parts.join(' '));
  }

  function nameOf(el, role) {
    var name = byIds(el, 'aria-labelledby');
    if (name) return { name: name, from: 'labelledby' };
    name = text(el.getAttribute('aria-label'));
    if (name) return { name: name, from: 'label' };
    var tag = el.localName;
    var type = (el.getAttribute('type') || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'meter' || tag === 'progress') {
      if (tag === 'input' && (type === 'button' || type === 'submit' || type === 'reset')) {
        name = text(el.value) || (type === 'submit' ? 'Submit' : type === 'reset' ? 'Reset' : '');
        if (name) return { name: name, from: 'value' };
      }
      if (tag === 'input' && type === 'image') {
        name = text(el.getAttribute('alt'));
        if (name) return { name: name, from: 'alt' };
      }
      name = labelText(el);
      if (name) return { name: name, from: 'label' };
    }
    if (tag === 'img' || tag === 'area') {
      name = text(el.getAttribute('alt'));
      if (name) return { name: name, from: 'alt' };
    }
    if (tag === 'table') {
      var caption = el.querySelector('caption');
      if (caption) return { name: text(caption.textContent), from: 'content' };
    }
    if (tag === 'fieldset') {
      var legend = el.querySelector('legend');
      if (legend) return { name: text(legend.textContent), from: 'content' };
    }
    if (NAME_FROM_CONTENT.has(role) && tag !== 'input' && tag !== 'select') {
      name = text(el.innerText !== undefined ? el.innerText : el.textContent);
      if (name) return { name: name, from: 'content' };
    }
    name = text(el.getAttribute('title'));
    if (name) return { name: name, from: 'title' };
    if (tag === 'input' || tag === 'textarea') {
      name = text(el.getAttribute('placeholder'));
      if (name) return { name: name, from: 'placeholder' };
    }
    return { name: '', from: '' };
  }

  function rendered(el) {
    if (el.closest('[aria-hidden="true"]')) return false;
    if (typeof el.checkVisibility === 'function') {
      return el.checkVisibility({ visibilityProperty: true });
    }
    var style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function include(el, role, name) {
    if (!role || role === 'none' || role === 'presentation' || role === 'generic') return false;
    if (role === 'option') {
      var select = el.closest('select');
      if (select && !(select.multiple || select.size > 1)) return false;
    } else if (!rendered(el)) {
      return false;
    }
    if (INTERACTIVE.has(role)) return true;
    if (SEMANTIC.has(role) && name) return true;
    return !!name;
  }

  function ariaBool(el, attr) {
    var v = el.getAttribute(attr);
    return v === null ? undefined : v === 'true';
  }

  function info(el, role, named) {
    var tag = el.localName;
    var out = { role: role, name: named.name, tag: tag };
    var type = el.getAttribute('type');
    if (tag === 'input') out.type = (type || 'text').toLowerCase();

    if (role === 'textbox' || role === 'searchbox' || role === 'spinbutton' || role === 'slider') {
      var value = el.isContentEditable && tag !== 'input' && tag !== 'textarea' ? el.textContent : el.value;
      if (value) out.value = String(value);
    } else if (role === 'combobox' && tag === 'select') {
      var opt = el.options[el.selectedIndex];
      if (opt && text(opt.textContent)) out.value = text(opt.textContent);
    }

    if (role === 'checkbox' || role === 'radio' || role === 'switch' || role === 'menuitemcheckbox' || role === 'menuitemradio') {
      var ariaChecked = ariaBool(el, 'aria-checked');
      out.checked = typeof el.checked === 'boolean' && tag === 'input' ? el.checked : !!ariaChecked;
    }
    if ((el.matches && el.matches(':disabled')) || ariaBool(el, 'aria-disabled') === true) out.disabled = true;
    if (el.required === true || ariaBool(el, 'aria-required') === true) out.required = true;
    if ((tag === 'option' && el.selected) || ariaBool(el, 'aria-selected') === true) out.selected = true;
    var expanded = ariaBool(el, 'aria-expanded');
    if (expanded !== undefined) out.expanded = expanded;
    else if (role === 'combobox' && tag === 'select') out.expanded = false;
    if (role === 'heading') {
      var level = parseInt(el.getAttribute('aria-level') || '', 10);
      if (!level && /^h[1-6]$/.test(tag)) level = parseInt(tag.slice(1), 10);
      if (level) out.level = level;
    }

    var description = byIds(el, 'aria-describedby') || text(el.getAttribute('aria-description'));
    if (!description && named.from !== 'title') description = text(el.getAttribute('title'));
    if (description) out.description = description;

    var rect = el.getBoundingClientRect();
    var visible = rendered(el) && (rect.width > 0 || rect.height > 0);
    out.visible = visible;
    if (visible) {
      out.bounds = { x: Math.round(rect.x), y: Math.round(rect.y),
        width: Math.round(rect.width), height: Math.round(rect.height) };
    }
    return out;
  }

  var results = [];
  function walk(root) {
    var all = root.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var role = roleOf(el);
      if (role) {
        var named = nameOf(el, role);
        if (include(el, role, named.name)) results.push([el, info(el, role, named)]);
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  }
  walk(document);
  return results;
}`;

/** The per-element data DOM_SNAPSHOT_FUNCTION returns, before refs exist. */
export type DomSnapshotInfo = Omit<ElementInfo, 'ref'>;

/** Coerce the deserialized info object from the page into ElementInfo. */
export function toElementInfo(ref: string, raw: unknown): ElementInfo {
  const info = (raw ?? {}) as Partial<DomSnapshotInfo>;
  const bounds = info.bounds as ElementBounds | undefined;
  return {
    ref,
    role: String(info.role ?? ''),
    name: String(info.name ?? ''),
    tag: String(info.tag ?? ''),
    visible: info.visible === true,
    ...(info.type !== undefined && { type: String(info.type) }),
    ...(info.value !== undefined && { value: String(info.value) }),
    ...(info.checked !== undefined && { checked: info.checked === true }),
    ...(info.disabled === true && { disabled: true }),
    ...(info.required === true && { required: true }),
    ...(info.selected === true && { selected: true }),
    ...(info.expanded !== undefined && { expanded: info.expanded === true }),
    ...(typeof info.level === 'number' && { level: info.level }),
    ...(bounds && { bounds }),
    ...(info.description && { description: String(info.description) })
  };
}
