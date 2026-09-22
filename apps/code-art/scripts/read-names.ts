/**
 * Reads every symbol's name out of a codedocs index, for the viewer to show
 * on a picked file's planets. Written beside the atlas rather than in it, so
 * the names cost nothing until someone asks for them.
 */

import { DatabaseSync } from 'node:sqlite'
import type { FileSymbols, SymbolNames } from '../src/lib/atlas.ts'
import { readLinks } from './read-links.ts'

interface Row {
  readonly id: number
  readonly path: string
  readonly kind: number
  readonly name: string
  readonly descriptors: string
}

/**
 * Each symbol's parent: the symbol whose descriptors are the longest proper
 * prefix of its own. A descriptor always ends on a suffix (`#`, `.`, `/`,
 * `().`), so a prefix that is itself a symbol ends on a segment boundary.
 *
 * Sorted, every symbol under a parent follows it in one unbroken run, so one
 * stack of open ancestors finds them all. A local inside an anonymous
 * callback has no symbol between it and the file, so it is top level.
 */
function parentsOf(rows: readonly Row[]): number[] {
  const order = rows.map((_, i) => i)
  order.sort((a, b) => (rows[a]!.descriptors < rows[b]!.descriptors ? -1 : 1))
  const parents = rows.map(() => -1)
  const open: number[] = []
  for (const i of order) {
    const own = rows[i]!.descriptors
    while (open.length > 0 && !own.startsWith(rows[open.at(-1)!]!.descriptors))
      open.pop()
    parents[i] = open.at(-1) ?? -1
    open.push(i)
  }
  return parents
}

/**
 * Every file's symbols, in the order they appear in the file, each with its
 * parent and the calls and references that touch it.
 */
export function readNames(dbPath: string): SymbolNames {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    // Paths escaping the root are skipped, as the atlas skips them.
    const rows = db
      .prepare(
        `select s.node_id as id, p.path, s.kind, s.name, n.descriptors from symbol s
         join path p on p.id = s.path_id join node n on n.id = s.node_id
         where p.path not like '../%' order by p.path, s.start`,
      )
      .all() as unknown as Row[]
    // Rows arrive ordered by path, so each file's rows are one run.
    const byFile = new Map<string, Row[]>()
    for (const row of rows) {
      const file = byFile.get(row.path)
      if (file) file.push(row)
      else byFile.set(row.path, [row])
    }
    // Each symbol's node, so a link's ends find their place in these lists.
    const symbolAt = new Map<number, { path: string; symbol: number }>()
    for (const [path, file] of byFile)
      file.forEach((row, symbol) => symbolAt.set(row.id, { path, symbol }))
    const links = readLinks(db, symbolAt)
    const names: Record<string, FileSymbols> = {}
    for (const [path, file] of byFile) {
      names[path] = {
        names: file.map((row) => row.name),
        kinds: file.map((row) => row.kind),
        parents: parentsOf(file),
        ...links.get(path),
      }
    }
    return names
  } finally {
    db.close()
  }
}
