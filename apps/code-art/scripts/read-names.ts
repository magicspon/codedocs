/**
 * Reads every symbol's name out of a codedocs index, for the viewer to show
 * on a picked file's planets. Written beside the atlas rather than in it, so
 * the names cost nothing until someone asks for them.
 */

import { DatabaseSync } from 'node:sqlite'
import { KINDS, type SymbolNames } from '../src/lib/atlas.ts'

/** Every file's symbol names, grouped by kind, in the order they appear in the file. */
export function readNames(dbPath: string): SymbolNames {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    // Paths escaping the root are skipped, as the atlas skips them.
    const rows = db
      .prepare(
        `select p.path, s.kind, s.name from symbol s join path p on p.id = s.path_id
         where p.path not like '../%' order by p.path, s.start`,
      )
      .all() as { path: string; kind: number; name: string }[]
    const names: Record<string, string[][]> = {}
    for (const row of rows) {
      const lists = (names[row.path] ??= KINDS.map(() => []))
      lists[row.kind]?.push(row.name)
    }
    return names
  } finally {
    db.close()
  }
}
