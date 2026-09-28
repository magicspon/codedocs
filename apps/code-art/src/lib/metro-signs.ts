import { isTest, type FileDatum } from './atlas.ts'
import type { Blocks } from './metro-buildings.ts'
import type { Frames } from './metro-frames.ts'
import type { Placement } from './metro-relax.ts'

/**
 * Billboards: the files the rest of the code leans on most (calls and
 * references landing on them) put their names up in lights, so the city's
 * landmarks can be read as you drive past. Only the busiest few get one: a
 * sign on every building would be noise.
 *
 * The very busiest, and squat buildings, carry theirs on the roof, turned to
 * face the driver. Other slender towers carry a blade instead: a long panel standing out from
 * its front, running up the side, the name reading top to bottom, seen along
 * the street.
 */

/** At most this many signs, and at most one per this many files. */
export const MAX_SIGNS = 128
const FILES_PER_SIGN = 12
/** How high above the roof a sign stands, on its struts. */
const LIFT = 1.2

/** Each sign as a panel in the world. */
export interface Signs {
  /** Per sign, the file it names. */
  readonly files: readonly number[]
  /** Per sign, its name as shown: the file's name without its extension. */
  readonly names: readonly string[]
  /** Per sign, `[x, y, z]` of its middle. */
  readonly middle: Float32Array
  /** Per sign, the unit way straight up it; a roof sign turns round this to face the driver. */
  readonly up: Float32Array
  /** Per sign, `1` for a blade up the side of a tower, `0` for a sign on a roof. */
  readonly blade: Uint8Array
  /** Per blade, the unit way it stands out from the facade; zero for a roof sign. */
  readonly out: Float32Array
  /** Per sign, `[width, height]` in world units. */
  readonly size: Float32Array
}

/** How many times taller than wide a tower must be to carry a blade. */
const BLADE_RATIO = 2.6

/**
 * Sets sign `s` as a blade up the front of building `i`: at one end of its
 * face, standing out from it, starting a quarter of the way up.
 */
function bladeOn(
  signs: Signs,
  s: number,
  i: number,
  blocks: Blocks,
  place: Placement,
  frames: Frames,
): void {
  const at = i * 3
  const tall = blocks.height[i]!
  const length = Math.min(30, tall * 0.55)
  const thick = Math.min(3.2, Math.max(1.8, length / 7))
  // Which end of the face, by the file's own seed, so neighbours differ.
  const end = blocks.seed[i]! < 0.5 ? -1 : 1
  const along = (blocks.width[i]! / 2 - 0.4) * end
  const up = tall * 0.25 + length / 2
  const out = blocks.depth[i]! / 2 + thick / 2 + 0.15
  for (let c = 0; c < 3; c++) {
    signs.middle[s * 3 + c] =
      place.foot[at + c]! +
      frames.x[at + c]! * along +
      frames.y[at + c]! * up +
      frames.z[at + c]! * out
    signs.up[s * 3 + c] = frames.y[at + c]!
    signs.out[s * 3 + c] = frames.z[at + c]!
  }
  signs.size.set([thick, length], s * 2)
  signs.blade[s] = 1
}

/** A file's name as a sign shows it: no folders, no extension, not too long. */
export function signName(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1)
  const dot = base.indexOf('.')
  const name = dot > 0 ? base.slice(0, dot) : base
  return name.length > 22 ? `${name.slice(0, 21)}…` : name
}

/** Signs for the busiest files, each on its own roof. */
export function signsOf(
  files: readonly FileDatum[],
  blocks: Blocks,
  place: Placement,
  frames: Frames,
): Signs {
  const count = Math.min(MAX_SIGNS, Math.ceil(files.length / FILES_PER_SIGN))
  const picked = files
    .map((f, i) => [i, f.callsIn + f.refsIn] as const)
    .filter(
      ([i, busy]) => busy > 0 && !isTest(files[i]!) && blocks.height[i]! > 8,
    )
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, count)
    .map(([i]) => i)
  const n = picked.length
  const signs = {
    files: picked,
    names: picked.map((i) => signName(files[i]!.path)),
    middle: new Float32Array(n * 3),
    up: new Float32Array(n * 3),
    size: new Float32Array(n * 2),
    blade: new Uint8Array(n),
    out: new Float32Array(n * 3),
  }
  picked.forEach((i, s) => {
    const at = i * 3
    const tall = blocks.height[i]!
    const wide = Math.max(blocks.width[i]!, blocks.depth[i]!)
    // The busiest third keep roof signs, seen from afar; the rest may be blades.
    if (s >= n / 3 && tall > 20 && tall > wide * BLADE_RATIO) {
      bladeOn(signs, s, i, blocks, place, frames)
      return
    }
    const width = Math.min(18, Math.max(7, blocks.width[i]! * 1.6))
    const height = width * 0.25
    const lift = tall + LIFT + height / 2
    for (let c = 0; c < 3; c++) {
      signs.middle[s * 3 + c] = place.foot[at + c]! + frames.y[at + c]! * lift
      signs.up[s * 3 + c] = frames.y[at + c]!
    }
    signs.size.set([width, height], s * 2)
  })
  return signs
}
