import type { FileDatum, FileSymbols, SymbolNames } from './atlas.ts'
import { Shape } from './metro-buildings.ts'
import type { Frames } from './metro-frames.ts'
import type { MetroLayout } from './metro-layout.ts'
import type { Vec3 } from './metro-sphere.ts'

/**
 * The poster pasted on the building the driver faces: what the file holds,
 * on the wall turned towards the driver, at street level.
 */

/** One line of a poster: some text, and the kind of symbol it names, or `-1`. */
export interface PosterLine {
  readonly text: string
  readonly kind: number
  /** Small print after the text, such as the symbol's kind. */
  readonly note: string
}

/** Where a poster hangs: its middle, its two axes on the wall, and its size. */
export interface PosterSpot {
  readonly middle: Vec3
  readonly across: Vec3
  readonly up: Vec3
  readonly width: number
  readonly height: number
}

/** How many symbols a poster lists before it just counts the rest. */
const LISTED = 8
/** Each kind in plain words, indexed by `KINDS`. */
const KIND_WORDS: readonly string[] = [
  'function',
  'class',
  'interface',
  'type',
  'enum',
  'variable',
  'method',
  'namespace',
]
/** How far in from the widest the flat faces of each shape lie, as a share of its width. */
const FACE_IN: Record<Shape, number> = {
  [Shape.block]: 0.5,
  [Shape.tower]: 0.462,
  [Shape.setback]: 0.5,
  [Shape.spire]: 0.4,
  [Shape.stepped]: 0.5,
  [Shape.pod]: 0.475,
}
/**
 * The poster's foot above the pavement, and the narrowest and widest it is
 * pasted: big enough to read from the road, even if it overhangs a narrow wall.
 */
const FOOT = 0.9
const NARROWEST = 3.5
const WIDEST = 9

/** `word` for `n` of them: `1 class`, `2 classes`, `3 functions`. */
function plural(word: string, n: number): string {
  if (n === 1) return word
  return word.endsWith('s') ? `${word}es` : `${word}s`
}

/**
 * The poster's lines: the file's own symbols, top-level first, each with its
 * kind; or, without names, how many of each kind the file declares.
 */
export function posterLines(
  file: FileDatum,
  symbols: FileSymbols | null,
): PosterLine[] {
  if (!symbols) {
    return file.kinds
      .map((n, k) => ({ n, k }))
      .filter(({ n }) => n > 0)
      .sort((a, b) => b.n - a.n)
      .map(({ n, k }) => ({
        text: `${n} ${plural(KIND_WORDS[k]!, n)}`,
        kind: k,
        note: '',
      }))
  }
  const order = symbols.names
    .map((name, i) => ({
      name,
      kind: symbols.kinds[i]!,
      top: symbols.parents[i] === -1,
    }))
    .sort((a, b) => Number(b.top) - Number(a.top))
  const lines = order
    .slice(0, LISTED)
    .map((s) => ({ text: s.name, kind: s.kind, note: KIND_WORDS[s.kind]! }))
  if (order.length > LISTED)
    lines.push({
      text: `and ${order.length - LISTED} more`,
      kind: -1,
      note: '',
    })
  return lines
}

/**
 * Where to paste a poster `aspect` times as tall as it is wide on building
 * `i`: on whichever wall faces `from`, just off it, standing on the pavement,
 * about as wide as the wall and no taller than the building.
 */
export function posterSpot(
  layout: MetroLayout,
  frames: Frames,
  i: number,
  from: Vec3,
  aspect: number,
): PosterSpot {
  const { foot } = layout.place
  const { width, depth, height, shape } = layout.blocks
  const at = i * 3
  const axis = (a: Float32Array): Vec3 => [a[at]!, a[at + 1]!, a[at + 2]!]
  const x = axis(frames.x)
  const up = axis(frames.y)
  const z = axis(frames.z)
  const rel: Vec3 = [
    from[0] - foot[at]!,
    from[1] - foot[at + 1]!,
    from[2] - foot[at + 2]!,
  ]
  const dot = (a: Vec3, b: Vec3): number =>
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  // The wall the driver is furthest outside of.
  const lx = dot(rel, x) / width[i]!
  const lz = dot(rel, z) / depth[i]!
  const onX = Math.abs(lx) > Math.abs(lz)
  const sign = Math.sign(onX ? lx : lz) || 1
  const normal: Vec3 = (onX ? x : z).map((c) => c * sign) as Vec3
  // Across the wall, left to right as the driver sees it.
  const across: Vec3 = [
    up[1] * normal[2] - up[2] * normal[1],
    up[2] * normal[0] - up[0] * normal[2],
    up[0] * normal[1] - up[1] * normal[0],
  ]
  const wall = onX ? depth[i]! : width[i]!
  const out = (onX ? width[i]! : depth[i]!) * FACE_IN[shape[i] as Shape] + 0.06
  let w = Math.min(WIDEST, Math.max(NARROWEST, wall * 0.9))
  let h = w * aspect
  const room = Math.max(1, height[i]! - FOOT - 0.3)
  if (h > room) {
    w *= room / h
    h = room
  }
  const lift = FOOT + h / 2
  return {
    middle: [0, 1, 2].map(
      (c) => foot[at + c]! + normal[c]! * out + up[c]! * lift,
    ) as Vec3,
    across,
    up,
    width: w,
    height: h,
  }
}

/**
 * The symbols of the file at `path`, for its poster: `undefined` while no
 * file is faced or the names are still loading, `null` when none were
 * exported for it.
 */
export function facedSymbols(
  names: SymbolNames | null | undefined,
  path: string | undefined,
): FileSymbols | null | undefined {
  if (path === undefined || names === undefined) return undefined
  return names?.[path] ?? null
}
