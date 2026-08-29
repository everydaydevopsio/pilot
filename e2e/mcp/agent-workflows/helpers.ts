/**
 * Build a data:text/html URL from an HTML string.
 * Encodes the HTML to produce a valid URL.
 */
export function dataUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html.trim())}`;
}
