import type { Link } from './atlas.ts'
import type { Direction } from './trace.ts'

/**
 * Walking the links of a selected file by keyboard: its direct neighbours on
 * each side, and a cursor that moves between them. Pure, so the key handling
 * can be tested without a DOM.
 */

/** Which side of the selected file a neighbour sits on: its callers or its callees. */
export type Side = 'in' | 'out'

/** A selected file's direct neighbours, heaviest link first. */
export interface Paths {
  readonly in: readonly number[]
  readonly out: readonly number[]
}

/** Where the cursor is: a side, and a place in that side's list. */
export interface PathCursor {
  readonly side: Side
  readonly index: number
}

/** A cursor move, as the arrow keys make them. */
export type Move = 'up' | 'down' | 'left' | 'right'

/**
 * The files one link away from `file`, each side heaviest first. A side the
 * search does not follow stays empty, so the list matches what is drawn.
 * `present` drops files that do not exist at the frame on show.
 */
export function pathsOf(
  links: readonly Link[],
  file: number,
  direction: Direction,
  present: (file: number) => boolean,
): Paths {
  const into: Link[] = []
  const out: Link[] = []
  for (const link of links) {
    if (link[0] === link[1]) continue
    if (link[1] === file && direction !== 'out') into.push(link)
    if (link[0] === file && direction !== 'in') out.push(link)
  }
  const sorted = (list: Link[], end: 0 | 1): number[] =>
    list
      .sort((a, b) => b[2] - a[2])
      .map((l) => l[end])
      .filter(present)
  return { in: sorted(into, 0), out: sorted(out, 1) }
}

/** Where the cursor starts: the heaviest callee, else the heaviest caller. */
export function firstCursor(paths: Paths): PathCursor {
  return { side: paths.out.length > 0 ? 'out' : 'in', index: 0 }
}

/**
 * The cursor after `move`. Up and down wrap round the side's list; left and
 * right cross to the callers or callees, keeping the place where it can. A
 * move onto an empty side is ignored.
 */
export function moveCursor(
  paths: Paths,
  cursor: PathCursor,
  move: Move,
): PathCursor {
  if (move === 'left' || move === 'right') {
    const side: Side = move === 'left' ? 'in' : 'out'
    const count = paths[side].length
    if (count === 0) return cursor
    return { side, index: Math.min(cursor.index, count - 1) }
  }
  const count = paths[cursor.side].length
  if (count === 0) return cursor
  const step = move === 'down' ? 1 : -1
  return { ...cursor, index: (cursor.index + step + count) % count }
}

/** The file under the cursor, or `null` when its side is empty. */
export function cursorFile(paths: Paths, cursor: PathCursor): number | null {
  return paths[cursor.side][cursor.index] ?? null
}
