/**
 * Markdown tables, and the way a number reads inside one.
 *
 * The write-up is a document rather than a console table, so it can carry every
 * column the benchmark measures instead of the handful that fit a terminal.
 * What it must not do is present a number as more certain than it is, which is
 * why an absent value prints as a dash and never as a zero.
 */

/** One row of cells, already rendered. */
export type Row = string[]

/**
 * Renders a markdown table, or nothing at all when there are no rows.
 *
 * Columns are padded to their widest cell. That is what the repository's
 * formatter would do to the file anyway, so emitting it directly keeps the
 * generated document stable under `pnpm check` — regenerating it produces no
 * diff, which is the only way a derived file can be committed without churn.
 */
export function table(headers: string[], rows: Row[]): string {
  if (rows.length === 0) return ''
  const widths = headers.map((header, at) =>
    Math.max(header.length, ...rows.map((row) => (row[at] ?? '').length), 3),
  )
  const line = (cells: string[]): string =>
    `| ${cells.map((cell, at) => cell.padEnd(widths[at] ?? 0)).join(' | ')} |`
  return [
    line(headers),
    line(widths.map((width) => '-'.repeat(width))),
    ...rows.map((row) => line(headers.map((_, at) => row[at] ?? ''))),
  ].join('\n')
}

/** A count, with thousands separated. */
export function num(value: number): string {
  return value.toLocaleString('en-GB')
}

/** A dollar amount, at the precision a single run is worth quoting to. */
export function usd(value: number): string {
  return `$${value.toFixed(3)}`
}

/**
 * A change from the reference, as a percentage. Negative is a saving.
 *
 * A reference of zero prints a dash: there is no percentage change from
 * nothing, and printing one would invent a result.
 */
export function change(reference: number, arm: number): string {
  if (reference === 0) return '—'
  const percent = ((arm - reference) / reference) * 100
  return `${percent > 0 ? '+' : ''}${percent.toFixed(0)}%`
}

/** A count over a total, or a dash where the total is zero. */
export function ratio(part: number, whole: number): string {
  return whole === 0 ? '—' : `${part}/${whole}`
}

/** A heading at the given level. */
export function heading(level: number, text: string): string {
  return `${'#'.repeat(level)} ${text}`
}

/** Joins sections with one blank line between them, dropping the empty ones. */
export function sections(parts: string[]): string {
  return parts.filter((part) => part.trim() !== '').join('\n\n')
}
