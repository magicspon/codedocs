import type { Atlas, Commit, FileDatum, Link, Timeline } from './atlas.ts'

/**
 * A timeline folded into what the scenes draw.
 *
 * Every scene lays out `merged` — each file that ever existed, at its largest —
 * so a file keeps one position for the whole history and grows in place
 * instead of the picture reshuffling at every commit. A plain export is a
 * series of one frame, so the scenes have one code path.
 */
export interface Series {
  /** The dataset name. */
  readonly name: string
  readonly commits: readonly Commit[]
  /** Every file and call across all frames, each at its maximum. */
  readonly merged: Atlas
  /** `at[frame][file]`: that merged file's datum in a frame, or `null` where it did not exist. */
  readonly at: readonly (readonly (FileDatum | null)[])[]
  /** Per merged file: `[birth, death)` in frames. */
  readonly fileLife: readonly Life[]
  /** Per merged call: `[birth, death)` in frames. */
  readonly callLife: readonly Life[]
}

/**
 * The frames something exists in, as `[first, one past last)`.
 *
 * A file deleted and later restored reads as present throughout: the span is
 * what a scene can animate cheaply, and such gaps are rare.
 */
export type Life = readonly [number, number]

/** Where the playback is, in fractional frames; mutated every animation frame. */
export interface Playhead {
  t: number
}

/** How visible something with `life` is at time `t`: fades in over the frame before birth, out over the one after. */
export function visibility(life: Life, t: number): number {
  const [birth, death] = life
  return (
    Math.min(1, Math.max(0, t - birth + 1)) *
    Math.min(1, Math.max(0, death - t))
  )
}

/** GLSL twin of `visibility`, for shaders with `birth` and `death` attributes. */
export const VISIBILITY_GLSL = /* glsl */ `
  float visibility(float birth, float death, float t) {
    return clamp(t - birth + 1.0, 0.0, 1.0) * clamp(death - t, 0.0, 1.0);
  }
`

/** Wraps a single export as a one-frame series. */
export function fromAtlas(atlas: Atlas): Series {
  return seriesOf({
    name: atlas.name,
    commits: [{ sha: atlas.commit, date: atlas.analysedAt, subject: '' }],
    frames: [atlas],
  })
}

function maxDatum(a: FileDatum, b: FileDatum): FileDatum {
  return {
    ...b,
    size: Math.max(a.size, b.size),
    kinds: a.kinds.map((n, k) => Math.max(n, b.kinds[k] ?? 0)),
    callsIn: Math.max(a.callsIn, b.callsIn),
    callsOut: Math.max(a.callsOut, b.callsOut),
    callsSelf: Math.max(a.callsSelf, b.callsSelf),
    refsIn: Math.max(a.refsIn, b.refsIn),
    unresolved: Math.max(a.unresolved, b.unresolved),
  }
}

/** Grows a life span to include `frame`. */
function extend(
  lives: Map<string, [number, number]>,
  key: string,
  frame: number,
): void {
  const life = lives.get(key)
  if (life) life[1] = frame + 1
  else lives.set(key, [frame, frame + 1])
}

/** Folds a timeline into one stable layout plus per-frame facts. */
export function seriesOf(timeline: Timeline): Series {
  const merged = new Map<string, FileDatum>()
  const fileLives = new Map<string, [number, number]>()
  timeline.frames.forEach((frame, f) => {
    for (const file of frame.files) {
      const seen = merged.get(file.path)
      merged.set(file.path, seen ? maxDatum(seen, file) : file)
      extend(fileLives, file.path, f)
    }
  })

  const paths = [...merged.keys()].sort()
  const index = new Map(paths.map((p, i) => [p, i]))
  const files = paths.map((p) => merged.get(p)!)

  const weights = new Map<string, number>()
  const callLives = new Map<string, [number, number]>()
  const imports = new Set<string>()
  timeline.frames.forEach((frame, f) => {
    // Links index the frame's own file list; re-key them by path-stable merged index.
    const local = frame.files.map((file) => index.get(file.path)!)
    for (const [from, to, weight] of frame.calls) {
      const key = `${local[from]} ${local[to]}`
      weights.set(key, Math.max(weights.get(key) ?? 0, weight))
      extend(callLives, key, f)
    }
    for (const [from, to] of frame.imports)
      imports.add(`${local[from]} ${local[to]}`)
  })

  const pair = (key: string): [number, number] => {
    const [a, b] = key.split(' ')
    return [Number(a), Number(b)]
  }
  const callKeys = [...weights.keys()].sort(
    (a, b) => weights.get(b)! - weights.get(a)!,
  )
  const calls: Link[] = callKeys.map((key) => [...pair(key), weights.get(key)!])
  const last = timeline.frames[timeline.frames.length - 1]

  return {
    name: timeline.name,
    commits: timeline.commits,
    merged: {
      name: timeline.name,
      commit: last?.commit ?? '',
      analysedAt: last?.analysedAt ?? '',
      projects: last?.projects ?? [],
      files,
      calls,
      imports: [...imports].map((key) => [...pair(key), 1]),
    },
    at: timeline.frames.map((frame) => {
      const row: (FileDatum | null)[] = paths.map(() => null)
      for (const file of frame.files) row[index.get(file.path)!] = file
      return row
    }),
    fileLife: paths.map((p) => fileLives.get(p)!),
    callLife: callKeys.map((key) => callLives.get(key)!),
  }
}
