import type { Client } from 'chrome-remote-interface';
import type { ElementRefMap } from './element-ref.js';

/**
 * Default diagnostic properties returned when no filter is specified.
 * Covers the most common layout/visibility debugging needs.
 */
const DEFAULT_PROPERTIES = new Set([
  'display',
  'visibility',
  'opacity',
  'position',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'overflow',
  'overflow-x',
  'overflow-y',
  'z-index',
  'transform',
  'color',
  'background-color',
  'font-size',
  'font-weight',
  'text-align',
  'flex-direction',
  'flex-wrap',
  'justify-content',
  'align-items',
  'align-self',
  'flex-grow',
  'flex-shrink',
  'gap',
  'grid-template-columns',
  'grid-template-rows',
  'border',
  'border-radius',
  'box-sizing',
  'pointer-events',
  'cursor'
]);

export interface BoxModelInfo {
  content: { x: number; y: number; width: number; height: number };
  padding: { top: number; right: number; bottom: number; left: number };
  border: { top: number; right: number; bottom: number; left: number };
  margin: { top: number; right: number; bottom: number; left: number };
  width: number;
  height: number;
}

export interface MatchedRule {
  selector: string;
  source: string;
  properties: Record<string, string>;
}

export interface StylesResult {
  ref: string;
  computed: Record<string, string>;
  matched: MatchedRule[];
  boxModel?: BoxModelInfo;
}

let cssEnabledFor: WeakRef<Client> | null = null;

async function ensureCssEnabled(client: Client): Promise<void> {
  if (cssEnabledFor?.deref() === client) return;
  await client.CSS.enable();
  cssEnabledFor = new WeakRef(client);
}

// Reset CSS enabled state (for reconnection)
export function resetCssState(): void {
  cssEnabledFor = null;
}

function parseQuad(quad: number[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const x = Math.min(quad[0], quad[2], quad[4], quad[6]);
  const y = Math.min(quad[1], quad[3], quad[5], quad[7]);
  const maxX = Math.max(quad[0], quad[2], quad[4], quad[6]);
  const maxY = Math.max(quad[1], quad[3], quad[5], quad[7]);
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(maxX - x),
    height: Math.round(maxY - y)
  };
}

function computeBoxEdges(
  outer: number[],
  inner: number[]
): { top: number; right: number; bottom: number; left: number } {
  const outerRect = parseQuad(outer);
  const innerRect = parseQuad(inner);
  return {
    top: Math.round(innerRect.y - outerRect.y),
    right: Math.round(
      outerRect.x + outerRect.width - (innerRect.x + innerRect.width)
    ),
    bottom: Math.round(
      outerRect.y + outerRect.height - (innerRect.y + innerRect.height)
    ),
    left: Math.round(innerRect.x - outerRect.x)
  };
}

export async function getStyles(
  client: Client,
  refMap: ElementRefMap,
  ref: string,
  properties?: string[]
): Promise<StylesResult> {
  const backendNodeId = refMap.resolve(ref);

  await ensureCssEnabled(client);
  await client.DOM.enable({});

  // We need a nodeId for CSS APIs — push the backend node to the frontend
  const { nodeIds } = await client.DOM.pushNodesByBackendIdsToFrontend({
    backendNodeIds: [backendNodeId]
  });
  const nodeId = nodeIds[0];
  if (!nodeId) {
    throw new Error(`Could not resolve ref "${ref}" to a DOM node`);
  }

  // Get computed styles
  const { computedStyle } = await client.CSS.getComputedStyleForNode({
    nodeId
  });

  const filterSet = properties
    ? new Set(properties.map((p) => p.toLowerCase()))
    : DEFAULT_PROPERTIES;

  const computed: Record<string, string> = {};
  for (const prop of computedStyle) {
    if (filterSet.has(prop.name)) {
      computed[prop.name] = prop.value;
    }
  }

  // Get matched CSS rules
  const matched: MatchedRule[] = [];
  try {
    const { matchedCSSRules } = await client.CSS.getMatchedStylesForNode({
      nodeId
    });
    if (matchedCSSRules) {
      for (const match of matchedCSSRules) {
        const rule = match.rule;
        const selector = rule.selectorList?.text ?? '';
        const source = rule.origin ?? 'regular';
        const ruleProps: Record<string, string> = {};
        for (const prop of rule.style.cssProperties) {
          if (filterSet.has(prop.name) && prop.value) {
            ruleProps[prop.name] = prop.value;
          }
        }
        if (Object.keys(ruleProps).length > 0) {
          matched.push({ selector, source, properties: ruleProps });
        }
      }
    }
  } catch {
    // getMatchedStylesForNode can fail for some node types
  }

  // Get box model
  let boxModel: BoxModelInfo | undefined;
  try {
    const { model } = await client.DOM.getBoxModel({ backendNodeId });
    boxModel = {
      content: parseQuad(model.content),
      padding: computeBoxEdges(model.padding, model.content),
      border: computeBoxEdges(model.border, model.padding),
      margin: computeBoxEdges(model.margin, model.border),
      width: model.width,
      height: model.height
    };
  } catch {
    // Element may not have a box model (display:none)
  }

  return { ref, computed, matched, boxModel };
}

export function formatStyles(result: StylesResult): string {
  const lines: string[] = [`Styles for ${result.ref}:\n`];

  // Computed styles (sorted for stable output)
  lines.push('Computed:');
  const entries = Object.entries(result.computed).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  if (entries.length === 0) {
    lines.push('  (none)');
  } else {
    for (const [name, value] of entries) {
      lines.push(`  ${name}: ${value}`);
    }
  }

  // Box model
  if (result.boxModel) {
    const bm = result.boxModel;
    lines.push('');
    lines.push('Box Model:');
    lines.push(
      `  content: ${bm.content.width}x${bm.content.height} at (${bm.content.x}, ${bm.content.y})`
    );
    lines.push(
      `  padding: ${bm.padding.top} ${bm.padding.right} ${bm.padding.bottom} ${bm.padding.left}`
    );
    lines.push(
      `  border: ${bm.border.top} ${bm.border.right} ${bm.border.bottom} ${bm.border.left}`
    );
    lines.push(
      `  margin: ${bm.margin.top} ${bm.margin.right} ${bm.margin.bottom} ${bm.margin.left}`
    );
    lines.push(`  total: ${bm.width}x${bm.height}`);
  }

  // Matched rules
  if (result.matched.length > 0) {
    lines.push('');
    lines.push('Matched Rules:');
    for (const rule of result.matched) {
      lines.push(`  ${rule.selector} (${rule.source}):`);
      const sortedProps = Object.entries(rule.properties).sort(([a], [b]) =>
        a.localeCompare(b)
      );
      for (const [name, value] of sortedProps) {
        lines.push(`    ${name}: ${value}`);
      }
    }
  }

  return lines.join('\n');
}
