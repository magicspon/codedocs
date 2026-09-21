/**
 * Folds a built page's script and stylesheet into the page itself, so it works
 * opened straight from disk. A browser refuses `<script type="module" src>` on
 * a `file:` page, but runs the same code inline.
 */

/**
 * The shipped page may make no request of any kind (ADR 0011). three.js
 * carries loaders that call `fetch`, which the viewer never uses but cannot
 * shake out; this has the browser refuse them anyway.
 */
export const POLICY =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:"

/** One built file the page links to, by the path it links it as. */
export interface Built {
  readonly name: string
  readonly kind: 'script' | 'style'
  readonly text: string
}

/** `name` as a pattern that matches only itself. */
const literal = (name: string): string =>
  name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The inline tag that stands in for `file`. */
function inline(file: Built): string {
  // `</script` inside the code would end the tag early; `<\/` means the same
  // in every place JavaScript can hold it.
  return file.kind === 'script'
    ? `<script type="module">${file.text.replaceAll('</script', '<\\/script')}</script>`
    : `<style>${file.text}</style>`
}

/**
 * `html` with the policy in its head and every file in `files` inlined where
 * it was linked. A file the page does not link is left out.
 */
export function singleFile(html: string, files: readonly Built[]): string {
  let page = html.replace(
    '<head>',
    `<head>\n    <meta http-equiv="Content-Security-Policy" content="${POLICY}" />`,
  )
  for (const file of files) {
    const tag = new RegExp(
      `<(?:script|link)[^>]*?(?:src|href)="[./]*${literal(file.name)}"[^>]*>(?:</script>)?`,
    )
    // A function, so a `$` in the code is not read as a pattern.
    page = page.replace(tag, () => inline(file))
  }
  return page
}
