/** What the index records about itself rather than about the code. */

import type { DatabaseSync } from 'node:sqlite'

import type { Store } from './open.ts'

/** What the index records about itself rather than about the code. */
export interface IndexHeader {
  /** The commit the snapshot describes, or `null` outside a repository. */
  readonly commit: string | null
  /** ISO timestamp of the most recent analysis, or `null` for an empty index. */
  readonly analysedAt: string | null
  readonly toolVersion: string
  readonly typescriptVersion: string
}

/** Read the index header. */
export function readHeader(store: Store): IndexHeader {
  const meta = new Map<string, string>()
  for (const row of store.db.prepare('select key, value from meta').all() as {
    key: string
    value: string
  }[]) {
    meta.set(row.key, row.value)
  }
  return {
    commit: meta.get('commit') ?? null,
    analysedAt: meta.get('analysedAt') ?? null,
    toolVersion: meta.get('toolVersion') ?? 'unknown',
    typescriptVersion: meta.get('typescriptVersion') ?? 'unknown',
  }
}

/** `meta` survives the clear, so every key is written rather than inserted. */
export function writeMeta(db: DatabaseSync, header: IndexHeader): void {
  const meta = db.prepare(
    'insert or replace into meta (key, value) values (?, ?)',
  )
  meta.run('commit', header.commit ?? '')
  meta.run('analysedAt', header.analysedAt ?? '')
  meta.run('toolVersion', header.toolVersion)
  meta.run('typescriptVersion', header.typescriptVersion)
}
