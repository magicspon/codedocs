import type { Store } from './open.ts'

/**
 * How many rows the index holds, for `analyse` to report what it built and for
 * a [[Report]] to say how large the index behind a failure was.
 *
 * Counted in SQLite rather than by reading the rows: `report-bug` wants the
 * size of an index it is not otherwise going to touch.
 */
export function counts(store: Store): {
  projects: number
  files: number
  symbols: number
  callEdges: number
  unresolved: number
} {
  const one = (sql: string): number =>
    (store.db.prepare(sql).get() as { n: number } | undefined)?.n ?? 0
  return {
    projects: one('select count(*) as n from project'),
    files: one('select count(*) as n from file'),
    symbols: one('select count(*) as n from symbol'),
    callEdges: one('select count(*) as n from call_edge'),
    unresolved: one('select count(*) as n from unresolved_call'),
  }
}
