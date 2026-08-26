import type { Client } from 'chrome-remote-interface';
import type { ElementRefMap } from './element-ref.js';
import type { ElementInfo, ElementBounds, SnapshotResult } from './types.js';
import { getLogger } from '../../util/logger.js';

/**
 * Roles that are always included in snapshots when they have
 * a name or are interactive.
 */
const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'searchbox',
  'checkbox',
  'radio',
  'combobox',
  'listbox',
  'option',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'tab',
  'switch',
  'slider',
  'spinbutton',
  'treeitem'
]);

/**
 * Roles included in snapshots when they have a name.
 */
const SEMANTIC_ROLES = new Set([
  'heading',
  'img',
  'alert',
  'dialog',
  'alertdialog',
  'navigation',
  'main',
  'complementary',
  'contentinfo',
  'banner',
  'form',
  'region',
  'table',
  'cell',
  'row',
  'columnheader',
  'rowheader'
]);

interface AXNode {
  nodeId: string;
  ignored: boolean;
  role?: { type: string; value?: string };
  name?: { type: string; value?: string };
  description?: { type: string; value?: string };
  value?: { type: string; value?: unknown };
  properties?: Array<{
    name: string;
    value: { type: string; value?: unknown };
  }>;
  backendDOMNodeId?: number;
  childIds?: string[];
  parentId?: string;
}

function getAXProperty(node: AXNode, propName: string): unknown | undefined {
  const prop = node.properties?.find((p) => p.name === propName);
  return prop?.value?.value;
}

function isNodeVisible(node: AXNode): boolean {
  const hidden = getAXProperty(node, 'hidden');
  if (hidden === true) return false;
  return true;
}

function shouldIncludeNode(node: AXNode): boolean {
  if (node.ignored) return false;

  const role = node.role?.value;
  if (!role || role === 'none' || role === 'presentation') return false;

  // Generic containers without names are noise
  if (role === 'generic' || role === 'GenericContainer') {
    return false;
  }

  const name = node.name?.value;

  // Interactive roles are always included
  if (INTERACTIVE_ROLES.has(role)) return true;

  // Semantic roles are included when they have a name
  if (SEMANTIC_ROLES.has(role) && name) return true;

  // Static text nodes with content
  if (role === 'StaticText' || role === 'text') return false;

  // Include any other node that has an explicit name (ARIA-labeled)
  if (name) return true;

  return false;
}

async function getBoxModelSafe(
  client: Client,
  backendNodeId: number
): Promise<ElementBounds | undefined> {
  try {
    const { model } = await client.DOM.getBoxModel({ backendNodeId });
    // content quad: [x1,y1, x2,y2, x3,y3, x4,y4]
    const content = model.content;
    const x = Math.min(content[0], content[2], content[4], content[6]);
    const y = Math.min(content[1], content[3], content[5], content[7]);
    const maxX = Math.max(content[0], content[2], content[4], content[6]);
    const maxY = Math.max(content[1], content[3], content[5], content[7]);
    return {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(maxX - x),
      height: Math.round(maxY - y)
    };
  } catch {
    // Element may not have a box model (e.g. display:none, zero-size)
    return undefined;
  }
}

async function getNodeTag(
  client: Client,
  backendNodeId: number
): Promise<{ tag: string; type?: string }> {
  try {
    const { node } = await client.DOM.describeNode({
      backendNodeId,
      depth: 0
    });
    const tag = node.nodeName?.toLowerCase() ?? '';
    // Extract input type from attributes
    let type: string | undefined;
    if (tag === 'input' && node.attributes) {
      for (let i = 0; i < node.attributes.length; i += 2) {
        if (node.attributes[i] === 'type') {
          type = node.attributes[i + 1];
          break;
        }
      }
    }
    return { tag, type };
  } catch {
    return { tag: '' };
  }
}

export async function buildSnapshot(
  client: Client,
  refMap: ElementRefMap
): Promise<SnapshotResult> {
  const logger = getLogger();

  // Invalidate old refs and start fresh
  refMap.invalidate();

  // Enable required domains
  await Promise.all([client.Accessibility.enable(), client.DOM.enable({})]);

  // Get the full accessibility tree
  const { nodes } = await client.Accessibility.getFullAXTree({});

  // Get page info
  const { result: urlResult } = await client.Runtime.evaluate({
    expression: 'document.URL',
    returnByValue: true
  });
  const { result: titleResult } = await client.Runtime.evaluate({
    expression: 'document.title',
    returnByValue: true
  });

  const url = String(urlResult.value ?? '');
  const title = String(titleResult.value ?? '');

  // Filter to meaningful nodes
  const candidates = (nodes as AXNode[]).filter(shouldIncludeNode);

  logger.debug(
    { totalNodes: nodes.length, candidates: candidates.length },
    'Building snapshot'
  );

  // Build element info for each candidate
  const elements: ElementInfo[] = [];

  for (const axNode of candidates) {
    if (!axNode.backendDOMNodeId) continue;

    const ref = refMap.nextRef();
    refMap.set(ref, axNode.backendDOMNodeId);

    const role = axNode.role?.value ?? '';
    const name = axNode.name?.value ?? '';

    // Get DOM tag and input type
    const { tag, type } = await getNodeTag(client, axNode.backendDOMNodeId);

    // Get bounds
    const bounds = await getBoxModelSafe(client, axNode.backendDOMNodeId);

    // Extract properties
    const checked = getAXProperty(axNode, 'checked');
    const disabled = getAXProperty(axNode, 'disabled');
    const required = getAXProperty(axNode, 'required');
    const selected = getAXProperty(axNode, 'selected');
    const expanded = getAXProperty(axNode, 'expanded');
    const level = getAXProperty(axNode, 'level');

    // Get value for form controls
    let value: string | undefined;
    if (axNode.value?.value !== undefined && axNode.value?.value !== '') {
      value = String(axNode.value.value);
    }

    const visible = isNodeVisible(axNode) && bounds !== undefined;
    const description = axNode.description?.value || undefined;

    const element: ElementInfo = {
      ref,
      role,
      name,
      tag,
      visible,
      ...(type !== undefined && { type }),
      ...(value !== undefined && { value }),
      ...(checked !== undefined && {
        checked: checked === true || checked === 'true'
      }),
      ...(disabled === true && { disabled: true }),
      ...(required === true && { required: true }),
      ...(selected === true && { selected: true }),
      ...(expanded !== undefined && { expanded: expanded === true }),
      ...(typeof level === 'number' && { level }),
      ...(bounds && { bounds }),
      ...(description && { description })
    };

    elements.push(element);
  }

  return {
    url,
    title,
    timestamp: Date.now(),
    elements
  };
}

export function formatSnapshot(snapshot: SnapshotResult): string {
  const lines: string[] = [];
  lines.push(`Page: ${snapshot.title || snapshot.url}`);
  lines.push(`URL: ${snapshot.url}`);
  lines.push('');

  if (snapshot.elements.length === 0) {
    lines.push('No interactive elements found.');
    return lines.join('\n');
  }

  lines.push(`Elements (${snapshot.elements.length}):`);
  lines.push('');

  for (const el of snapshot.elements) {
    const parts: string[] = [`[${el.ref}]`, el.role];

    if (el.name) {
      parts.push(`"${el.name}"`);
    }

    const attrs: string[] = [];
    if (el.tag && el.tag !== el.role) attrs.push(el.tag);
    if (el.type) attrs.push(`type=${el.type}`);
    if (el.value !== undefined) attrs.push(`value="${el.value}"`);
    if (el.checked !== undefined)
      attrs.push(el.checked ? 'checked' : 'unchecked');
    if (el.disabled) attrs.push('disabled');
    if (el.required) attrs.push('required');
    if (el.selected) attrs.push('selected');
    if (el.expanded !== undefined)
      attrs.push(el.expanded ? 'expanded' : 'collapsed');
    if (el.level !== undefined) attrs.push(`level=${el.level}`);
    if (!el.visible) attrs.push('hidden');

    if (attrs.length > 0) {
      parts.push(`(${attrs.join(', ')})`);
    }

    lines.push('  ' + parts.join(' '));
  }

  return lines.join('\n');
}

export function findElements(
  snapshot: SnapshotResult,
  query: {
    role?: string;
    name?: string;
    text?: string;
  }
): ElementInfo[] {
  return snapshot.elements.filter((el) => {
    if (query.role && el.role.toLowerCase() !== query.role.toLowerCase()) {
      return false;
    }
    if (query.name) {
      const nameMatch = el.name
        .toLowerCase()
        .includes(query.name.toLowerCase());
      if (!nameMatch) return false;
    }
    if (query.text) {
      const textLower = query.text.toLowerCase();
      const nameMatch = el.name.toLowerCase().includes(textLower);
      const valueMatch = el.value?.toLowerCase().includes(textLower) ?? false;
      const descMatch =
        el.description?.toLowerCase().includes(textLower) ?? false;
      if (!nameMatch && !valueMatch && !descMatch) return false;
    }
    return true;
  });
}
