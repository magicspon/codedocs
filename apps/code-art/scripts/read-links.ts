/**
 * Reads the calls and references between symbols out of a codedocs index,
 * per file, for the viewer to draw off a focused planet's moons. The atlas
 * only keeps these summed per file pair; here each end keeps its symbol.
 */

import type { DatabaseSync } from 'node:sqlite'
import { LINK_WIDTH } from '../src/lib/atlas.ts'

/** A hub symbol can be called from hundreds of places; its heaviest say enough. */
const MAX_PER_SYMBOL = 24

/** Where a node sits: its file, and its symbol in that file's source order, or `-1`. */
interface End {
  readonly path: string
  readonly symbol: number
}

/** One file's links while they are gathered. */
interface Gathered {
  readonly peers: string[]
  readonly peerAt: Map<string, number>
  readonly rows: number[][]
}

/** The links and peers `FileSymbols` carries. */
export interface FileLinks {
  readonly peers: readonly string[]
  readonly links: readonly number[]
}

type Row = Record<string, number | string>

/**
 * Every node's file and symbol. A node that is no symbol (a file's own
 * top-level code, or a local the index does not name) stands for its file.
 */
function endsOf(
  db: DatabaseSync,
  symbolAt: ReadonlyMap<number, End>,
): Map<number, End> {
  const ends = new Map(symbolAt)
  const rows = db
    .prepare(
      `select n.id, p.path from node n join path p on p.id = n.path_id
       where p.path not like '../%'`,
    )
    .all() as Row[]
  for (const r of rows) {
    const id = Number(r.id)
    if (!ends.has(id)) ends.set(id, { path: String(r.path), symbol: -1 })
  }
  return ends
}

/** Adds one link to the file at `own`'s end; a file-level end has no moon to draw it from. */
function add(
  files: Map<string, Gathered>,
  own: End,
  other: End,
  via: number,
  inbound: number,
  count: number,
): void {
  if (own.symbol < 0) return
  let file = files.get(own.path)
  if (!file) {
    file = { peers: [], peerAt: new Map(), rows: [] }
    files.set(own.path, file)
  }
  // `-1` for the same file, else an index into the file's own peer list.
  let peer = -1
  if (other.path !== own.path) {
    peer = file.peerAt.get(other.path) ?? file.peers.length
    if (peer === file.peers.length) {
      file.peers.push(other.path)
      file.peerAt.set(other.path, peer)
    }
  }
  file.rows.push([own.symbol, via, inbound, peer, other.symbol, count])
}

/** The heaviest `MAX_PER_SYMBOL` links per symbol, way and direction, flattened. */
function capped(rows: number[][]): number[] {
  rows.sort(
    (a, b) => a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]! || b[5]! - a[5]!,
  )
  const out: number[] = []
  let run = 0
  rows.forEach((row, i) => {
    const prev = rows[i - 1]
    const same =
      prev && prev[0] === row[0] && prev[1] === row[1] && prev[2] === row[2]
    run = same ? run + 1 : 0
    if (run < MAX_PER_SYMBOL) out.push(...row)
  })
  return out
}

/**
 * Each file's links, keyed by path. `symbolAt` maps a symbol's node id to
 * its place in `readNames`' order. Calls are way `0`; references are way
 * `1 +` their stored kind, so extends and implements keep their own colour.
 */
export function readLinks(
  db: DatabaseSync,
  symbolAt: ReadonlyMap<number, End>,
): Map<string, FileLinks> {
  const ends = endsOf(db, symbolAt)
  const edges = [
    ...(db
      .prepare(
        'select from_id as a, to_id as b, 0 as via, count(*) as n from call_edge group by 1, 2',
      )
      .all() as Row[]),
    ...(db
      .prepare(
        'select from_id as a, to_id as b, 1 + kind as via, count(*) as n from reference_edge group by 1, 2, 3',
      )
      .all() as Row[]),
  ]
  const files = new Map<string, Gathered>()
  for (const e of edges) {
    const from = ends.get(Number(e.a))
    const to = ends.get(Number(e.b))
    // Recursion is a symbol linking to itself: nothing to draw.
    if (!from || !to || Number(e.a) === Number(e.b)) continue
    const via = Number(e.via)
    const n = Number(e.n)
    add(files, from, to, via, 0, n)
    add(files, to, from, via, 1, n)
  }
  const out = new Map<string, FileLinks>()
  for (const [path, file] of files) {
    const links = capped(file.rows)
    if (links.length % LINK_WIDTH !== 0) throw new Error('bad link row')
    out.set(path, { peers: file.peers, links })
  }
  return out
}
