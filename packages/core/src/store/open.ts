/**
 * The index: one SQLite file per working tree, holding one snapshot.
 *
 * ADR 0004 chose SQLite over a JSON blob on what scales rather than on what it
 * costs today — a cold process answers one `callers` question in 30 ms against
 * 110 ms, at 48 MB resident against 270 MB, and a two-file edit rewrites 6.8 ms
 * of rows rather than the whole file.
 *
 * This is not a decision to use SQLite's query engine. Operations read rows and
 * answer in code; nothing in the CLI surface may expose SQL, or SQLite becomes
 * an interface we cannot change.
 */

import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { DDL, STORE_SCHEMA_VERSION, TABLES } from './schema.ts'

/** A handle on one working tree's index. */
export interface Store {
  readonly db: DatabaseSync
  readonly directory: string
  close(): void
}

function readUserVersion(db: DatabaseSync): number {
  const row = db.prepare('pragma user_version').get() as
    | { user_version?: number }
    | undefined
  return row?.user_version ?? 0
}

/**
 * Open (and create, if absent) the index for a working tree.
 *
 * `.codedocs/.gitignore` containing `*` makes the whole directory invisible to
 * `git status` without the user editing anything. The directory is safe to
 * delete: that is the supported way to force a cold build.
 */
export function openStore(root: string): Store {
  const directory = join(root, '.codedocs')
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, '.gitignore'), '*\n')

  const db = new DatabaseSync(join(directory, 'index.db'))
  // WAL so a reader in another process is never shown a half-written index,
  // only an older consistent one.
  db.exec('pragma journal_mode = wal')
  db.exec('pragma foreign_keys = on')

  const found = readUserVersion(db)
  if (found !== 0 && found !== STORE_SCHEMA_VERSION) {
    // Discarded, never migrated. Dropping the tables is enough for correctness:
    // the caller's next `analyse` rebuilds, and a rebuild is unconditionally
    // correct.
    for (const table of TABLES) {
      db.exec(`drop table if exists ${table}`)
    }
    // Dropped pages stay in the file as free pages, so without this an index
    // upgraded from the pre-interning schema would keep its 61 MB for ever and
    // hold 17 MB of rows in it. The cost is one rewrite of a file the next step
    // is about to spend 16 seconds refilling.
    db.exec('vacuum')
  }
  db.exec(DDL)
  db.exec(`pragma user_version = ${STORE_SCHEMA_VERSION}`)

  return {
    db,
    directory,
    close: () => db.close(),
  }
}
