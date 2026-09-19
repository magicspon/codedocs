/**
 * A squarified treemap of the directory tree. The city and the landscape both
 * stand on it, so a folder is a district in one and a region of hills in the
 * other, and files that live together sit together.
 */

/** An axis-aligned rectangle on the ground plane. */
export interface Rect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/** One laid-out directory, for drawing district plates. */
export interface Region extends Rect {
  readonly path: string
  readonly depth: number
}

/** The layout: one rect per file, in input order, plus every directory's rect. */
export interface Layout {
  readonly files: readonly Rect[]
  readonly regions: readonly Region[]
}

interface Dir {
  name: string
  dirs: Map<string, Dir>
  files: number[]
  weight: number
}

function buildTree(paths: readonly string[], weights: readonly number[]): Dir {
  const root: Dir = { name: '', dirs: new Map(), files: [], weight: 0 }
  paths.forEach((path, i) => {
    const parts = path.split('/')
    parts.pop()
    let dir = root
    dir.weight += weights[i]!
    for (const part of parts) {
      let next = dir.dirs.get(part)
      if (!next) {
        next = { name: part, dirs: new Map(), files: [], weight: 0 }
        dir.dirs.set(part, next)
      }
      next.weight += weights[i]!
      dir = next
    }
    dir.files.push(i)
  })
  return root
}

interface Item {
  readonly weight: number
  readonly dir?: Dir
  readonly file?: number
}

/** The worst aspect ratio in a row, which squarify keeps as close to 1 as it can. */
function worst(row: readonly Item[], side: number, scale: number): number {
  let sum = 0
  let max = 0
  let min = Infinity
  for (const item of row) {
    const area = item.weight * scale
    sum += area
    max = Math.max(max, area)
    min = Math.min(min, area)
  }
  const s2 = side * side
  const sum2 = sum * sum
  return Math.max((s2 * max) / sum2, sum2 / (s2 * min))
}

/** Squarify: fills `rect` with `items`, each area proportional to its weight. */
function squarify(
  items: Item[],
  rect: Rect,
  place: (item: Item, at: Rect) => void,
): void {
  const total = items.reduce((sum, item) => sum + item.weight, 0)
  if (total <= 0) return
  const scale = (rect.w * rect.h) / total
  let { x, y, w, h } = rect
  let row: Item[] = []
  const queue = [...items].sort((a, b) => b.weight - a.weight)

  const flush = (): void => {
    const area = row.reduce((sum, item) => sum + item.weight * scale, 0)
    const horizontal = w >= h
    const thickness = horizontal ? area / h : area / w
    let offset = 0
    for (const item of row) {
      const length = (item.weight * scale) / thickness
      place(
        item,
        horizontal
          ? { x, y: y + offset, w: thickness, h: length }
          : { x: x + offset, y, w: length, h: thickness },
      )
      offset += length
    }
    if (horizontal) {
      x += thickness
      w -= thickness
    } else {
      y += thickness
      h -= thickness
    }
    row = []
  }

  for (const item of queue) {
    const side = Math.min(w, h)
    if (
      row.length === 0 ||
      worst([...row, item], side, scale) <= worst(row, side, scale)
    ) {
      row.push(item)
    } else {
      flush()
      row.push(item)
    }
  }
  if (row.length > 0) flush()
}

/**
 * Lays out `paths` in a `size` × `size` square centred on the origin.
 *
 * `padding` is the gap each directory leaves inside its rect, which is what
 * makes districts read as districts rather than one continuous carpet.
 */
export function treemap(
  paths: readonly string[],
  weights: readonly number[],
  size: number,
  padding: number,
): Layout {
  const files: Rect[] = paths.map(() => ({ x: 0, y: 0, w: 0, h: 0 }))
  const regions: Region[] = []

  const visit = (dir: Dir, rect: Rect, path: string, depth: number): void => {
    // A directory holding one directory and nothing else adds a border and no
    // information — `src/vs/…` in vscode would otherwise be three nested plates.
    if (dir.files.length === 0 && dir.dirs.size === 1) {
      const [only] = dir.dirs.values()
      visit(only!, rect, path ? `${path}/${only!.name}` : only!.name, depth)
      return
    }
    if (depth > 0) regions.push({ ...rect, path, depth })
    const pad = Math.min(padding, rect.w * 0.1, rect.h * 0.1)
    const inner = {
      x: rect.x + pad,
      y: rect.y + pad,
      w: rect.w - 2 * pad,
      h: rect.h - 2 * pad,
    }
    const items: Item[] = [
      ...[...dir.dirs.values()].map((d) => ({ weight: d.weight, dir: d })),
      ...dir.files.map((i) => ({ weight: weights[i]!, file: i })),
    ]
    squarify(items, inner, (item, at) => {
      if (item.file !== undefined) files[item.file] = at
      else if (item.dir) {
        visit(
          item.dir,
          at,
          path ? `${path}/${item.dir.name}` : item.dir.name,
          depth + 1,
        )
      }
    })
  }

  visit(
    buildTree(paths, weights),
    { x: -size / 2, y: -size / 2, w: size, h: size },
    '',
    0,
  )
  return { files, regions }
}
