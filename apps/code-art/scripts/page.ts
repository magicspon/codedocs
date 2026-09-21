/**
 * The page `codedocs art` writes: the embed build of the viewer with every
 * dataset inlined, so it opens from disk and makes no request (ADR 0011).
 */

import type { Atlas, Timeline } from '../src/lib/atlas.ts'

/** Where the embed build leaves room for the data; see `index.html`. */
const MARKER = '<!-- codedocs-art:data -->'

/** `&` and `"` would end or garble the attribute a name sits in. */
function attribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
}

/**
 * One inline JSON block. `<` is escaped so no string in the data can close
 * the script tag; `<` reads back as the same character.
 */
function block(name: string, data: Atlas | Timeline): string {
  const json = JSON.stringify(data).replaceAll('<', '\\u003c')
  return `<script type="application/json" data-dataset="${attribute(name)}">${json}</script>`
}

/**
 * The viewer with `datasets` written in, by name. Throws when `viewer` is not
 * the embed build, which is the only one with the marker.
 */
export function artPage(
  viewer: string,
  datasets: Readonly<Record<string, Atlas | Timeline>>,
): string {
  if (!viewer.includes(MARKER)) {
    throw new Error('not the embed build of the viewer: no data marker')
  }
  const blocks = Object.entries(datasets).map(([name, data]) =>
    block(name, data),
  )
  // A function, so a `$` in the data is not read as a pattern.
  return viewer.replace(MARKER, () => blocks.join('\n'))
}
