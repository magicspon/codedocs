import { isTest, ROLES, symbolCount, type FileDatum } from './atlas.ts'
import { heatOf, wearOf } from './health.ts'
import { hash, rng } from './rng.ts'

/**
 * What each file's building looks like, read from the file alone: one
 * building per file, so every tower on the skyline is a file you can name.
 *
 * - **Height** is the symbol count; **footprint** is the file's size on disk.
 * - **Shape** is the kind of symbol it declares most: classes step back as
 *   they rise, functions stand as eight-sided towers, types taper to spires,
 *   enums and namespaces climb as ziggurats, the rest are plain blocks. Tests
 *   are low round pods; config files are squat utility blocks.
 * - **Lit windows** are how busy the file is: calls in, out and within, and
 *   references in, per symbol. A file nothing touches stands dark.
 * - **Health**, where fallow ran: hotspots burn red, hard-to-change files
 *   grime over, dead code goes dark, and blind spots (calls the analysis
 *   could not resolve) make the signs glitch.
 */

/** Building shapes, one instanced mesh each. */
export const Shape = {
  block: 0,
  tower: 1,
  setback: 2,
  spire: 3,
  stepped: 4,
  pod: 5,
} as const
export type Shape = (typeof Shape)[keyof typeof Shape]

/** Every shape, in order. */
export const SHAPES: readonly Shape[] = Object.values(Shape)

/** Per `KINDS` entry, the shape a file mostly of that kind takes. */
const KIND_SHAPES: readonly Shape[] = [
  Shape.tower, // function
  Shape.setback, // class
  Shape.spire, // interface
  Shape.spire, // typeAlias
  Shape.stepped, // enum
  Shape.block, // variable
  Shape.setback, // method
  Shape.stepped, // namespace
]

/** Flags packed into `Blocks.flags`. */
export const Flag = { generated: 1, test: 2, config: 4 } as const

/** Every file's building, as flat arrays indexed by file. */
export interface Blocks {
  readonly count: number
  readonly shape: Uint8Array
  /** World units: across, up, and front to back. */
  readonly width: Float32Array
  readonly height: Float32Array
  readonly depth: Float32Array
  /** The kind of symbol the file declares most, as an index into `KINDS`. */
  readonly kind: Uint8Array
  /** `0`–`1`: the share of windows lit. */
  readonly lights: Float32Array
  /** `[heat, wear, dead, glitch]` per file, each `0`–`1`. */
  readonly health: Float32Array
  /** A stable `0`–`1` per file, so its windows and signs never reshuffle. */
  readonly seed: Float32Array
  readonly flags: Uint8Array
  /** How far from its middle the buggy is kept, in world units. */
  readonly reach: Float32Array
}

/** Height for `symbols` symbols: a steep start, then a long, slow climb. */
export function heightOf(symbols: number): number {
  return 3 + 4.2 * Math.pow(Math.log2(1 + symbols), 1.25)
}

/** Footprint width for a file of `bytes` bytes. */
function widthOf(bytes: number): number {
  return Math.min(13, 2.6 + 1.05 * Math.log2(1 + bytes / 1000))
}

/** The ground every building's plot takes, alleys included, in square world units. */
export function groundOf(blocks: Blocks, alley: number): number {
  let total = 0
  for (let i = 0; i < blocks.count; i++)
    total += Math.PI * (blocks.reach[i]! + alley / 2) ** 2
  return total
}

/** The index of the largest count, or `-1` when every count is zero. */
function dominant(kinds: readonly number[]): number {
  let best = -1
  let most = 0
  kinds.forEach((n, k) => {
    if (n > most) {
      most = n
      best = k
    }
  })
  return best
}

/** How busy a file is for its size, as a share of windows lit. */
function lightsOf(file: FileDatum, symbols: number): number {
  const touches = file.callsIn + file.callsOut + file.callsSelf + file.refsIn
  if (touches === 0) return 0.04
  return 0.12 + 0.83 * (1 - Math.exp(-touches / Math.max(1, symbols) / 2.5))
}

/** A building's shape and size, from its file: tests squat as pods, config sits low. */
function formOf(
  file: FileDatum,
  main: number,
  test: boolean,
  config: boolean,
  random: () => number,
): { shape: Shape; width: number; height: number; depth: number } {
  let shape: Shape = main === -1 ? Shape.block : KIND_SHAPES[main]!
  let height = heightOf(symbolCount(file)) * (0.85 + 0.3 * random())
  let width = widthOf(file.size)
  if (test) {
    shape = Shape.pod
    height = Math.min(height, 2 + height * 0.15)
    width *= 1.2
  } else if (config) {
    shape = Shape.block
    height *= 0.45
  }
  // Round and pointed shapes stand square; the rest are a little off square.
  const square =
    shape === Shape.spire || shape === Shape.tower || shape === Shape.pod
  const depth = square ? width : width * (0.65 + 0.35 * random())
  return { shape, width, height, depth }
}

/** Builds every file's building; `deadCode` says whether fallow's unused marks can be trusted. */
export function blocksOf(
  files: readonly FileDatum[],
  deadCode: boolean,
): Blocks {
  const n = files.length
  const blocks: Blocks = {
    count: n,
    shape: new Uint8Array(n),
    width: new Float32Array(n),
    height: new Float32Array(n),
    depth: new Float32Array(n),
    kind: new Uint8Array(n),
    lights: new Float32Array(n),
    health: new Float32Array(n * 4),
    seed: new Float32Array(n),
    flags: new Uint8Array(n),
    reach: new Float32Array(n),
  }
  files.forEach((file, i) => {
    const random = rng(hash(file.path))
    const symbols = symbolCount(file)
    const main = dominant(file.kinds)
    const test = isTest(file)
    const config = ROLES[file.role] === 'config'
    const { shape, width, height, depth } = formOf(
      file,
      main,
      test,
      config,
      random,
    )
    blocks.shape[i] = shape
    blocks.width[i] = width
    blocks.height[i] = height
    blocks.depth[i] = depth
    blocks.kind[i] = Math.max(0, main)
    blocks.lights[i] = lightsOf(file, symbols)
    blocks.seed[i] = random()
    blocks.flags[i] =
      (file.generated ? Flag.generated : 0) |
      (test ? Flag.test : 0) |
      (config ? Flag.config : 0)
    blocks.reach[i] = Math.hypot(width, depth) / 2
    const blind =
      file.unresolved / (file.unresolved + file.callsOut + file.callsSelf + 1)
    blocks.health.set(
      [
        heatOf(file.health),
        wearOf(file.health),
        deadCode && file.health?.unused ? 1 : 0,
        Math.min(1, blind * 1.5),
      ],
      i * 4,
    )
  })
  return blocks
}
