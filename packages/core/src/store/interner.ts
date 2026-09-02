/**
 * Turning the model's strings into the integers the tables hold.
 *
 * The write-side intern cache, one per open store, held beside the store
 * rather than on it, so nothing above this module can reach the id space: a
 * `Store` is still a database handle and a directory.
 */

import type { DatabaseSync } from 'node:sqlite'

import type { CallSource, FilePath } from '../model.ts'
import { partsOf } from './shared.ts'
import type { Store } from './open.ts'

const interners = new WeakMap<Store, Interner>()

/** Turns the model's strings into the integers the tables hold. */
interface Interner {
  path(text: FilePath): number
  node(id: CallSource): number
  /** Forget everything, for when the rows those ids named have been deleted. */
  reset(): void
}

/**
 * Read-then-insert, memoised per run.
 *
 * A wave mostly re-interns strings the index already holds, so the read comes
 * first; a cold build mostly inserts, and the memo means each distinct string is
 * looked up once however many rows repeat it.
 */
function makeInterner(db: DatabaseSync): Interner {
  const paths = new Map<string, number>()
  const nodes = new Map<string, number>()
  const selectPath = db.prepare('select id from path where path = ?')
  const insertPath = db.prepare('insert into path (path) values (?)')
  const selectNode = db.prepare(
    'select id from node where path_id = ? and descriptors = ?',
  )
  const insertNode = db.prepare(
    'insert into node (path_id, descriptors) values (?, ?)',
  )

  const path = (text: FilePath): number => {
    const cached = paths.get(text)
    if (cached !== undefined) return cached
    const found = selectPath.get(text) as { id: number } | undefined
    const id = found?.id ?? Number(insertPath.run(text).lastInsertRowid)
    paths.set(text, id)
    return id
  }

  const node = (id: CallSource): number => {
    const cached = nodes.get(id)
    if (cached !== undefined) return cached
    const [file, descriptors] = partsOf(id)
    const pathId = path(file)
    const found = selectNode.get(pathId, descriptors) as
      | { id: number }
      | undefined
    const nodeId =
      found?.id ?? Number(insertNode.run(pathId, descriptors).lastInsertRowid)
    nodes.set(id, nodeId)
    return nodeId
  }

  return {
    path,
    node,
    reset: () => {
      paths.clear()
      nodes.clear()
    },
  }
}

export function internerFor(store: Store): Interner {
  let found = interners.get(store)
  if (found === undefined) {
    found = makeInterner(store.db)
    interners.set(store, found)
  }
  return found
}
