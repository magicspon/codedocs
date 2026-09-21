import { Color } from 'three'
import { rng } from './rng.ts'
import type { Life } from './series.ts'
import type { Trace } from './trace.ts'

/**
 * The trace's geometry: an arc per edge, packets of light that ride the arcs
 * in slot order, and a marker on every file the trace touches. Scene-agnostic:
 * a scene hands over where each file sits and how high its arcs should bow.
 */

/** Where a file's arcs leave from, in scene units. */
export type Anchor = readonly [number, number, number]

/** Light leaving the searched files: warm, like the city's own traffic. */
const OUT_COLOR: Color = new Color('#ffb347')
/** Light arriving at the searched files: cool, so the two never read as one. */
const IN_COLOR: Color = new Color('#4fd3ff')
const ROOT_COLOR = new Color('#f2f8ff')

const ARC_SEGMENTS = 20
/** A packet's particles, head first; heavier links send longer packets. */
const PACKET_MIN = 3
const PACKET_MAX = 7
/** Faint particles always drifting along each arc, so the flow reads even between waves. */
const DRIFT = 2

/** Arc segments, each vertex knowing how far along its arc it is. */
export interface FlowLines {
  readonly positions: Float32Array
  readonly colors: Float32Array
  readonly progress: Float32Array
  readonly slots: Float32Array
  readonly births: Float32Array
  readonly deaths: Float32Array
}

/** Particles that place themselves on their arc in the shader. */
export interface FlowParticles {
  readonly starts: Float32Array
  readonly controls: Float32Array
  readonly ends: Float32Array
  readonly colors: Float32Array
  readonly slots: Float32Array
  /** How far behind its packet's head a particle rides; for a drift particle, its phase. */
  readonly offsets: Float32Array
  /** `0` rides a wave, `1` drifts. */
  readonly modes: Float32Array
  readonly sizes: Float32Array
  readonly births: Float32Array
  readonly deaths: Float32Array
}

/** One marker per touched file. */
export interface FlowMarkers {
  readonly positions: Float32Array
  readonly colors: Float32Array
  readonly sizes: Float32Array
  /** `1` for a searched file, which wears a ripple rather than a dot. */
  readonly roots: Float32Array
  /** When in the loop light lands on the file, for its flash. */
  readonly arrivals: Float32Array
  readonly births: Float32Array
  readonly deaths: Float32Array
}

export interface Flow {
  readonly lines: FlowLines
  readonly particles: FlowParticles
  readonly markers: FlowMarkers
  /** Slots per loop, plus one beat of rest so each wave reads as a wave. */
  readonly loop: number
}

/** How a scene shapes the trace. */
export interface FlowShape {
  readonly anchors: readonly Anchor[]
  /** How high an arc rises over its higher end, as a share of its span. */
  readonly bow: number
  /** A particle's size in scene units. */
  readonly size: number
  readonly lives: readonly Life[]
}

/** A quadratic Bézier's control point: above the midpoint, clear of both ends. */
function control(a: Anchor, b: Anchor, bow: number): Anchor {
  const span = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  return [
    (a[0] + b[0]) / 2,
    Math.max(a[1], b[1]) + span * bow,
    (a[2] + b[2]) / 2,
  ]
}

function bezier(a: Anchor, c: Anchor, b: Anchor, t: number): Anchor {
  const u = 1 - t
  const at = (k: 0 | 1 | 2): number =>
    u * u * a[k] + 2 * u * t * c[k] + t * t * b[k]
  return [at(0), at(1), at(2)]
}

function arcLines(trace: Trace, shape: FlowShape): FlowLines {
  const n = trace.edges.length * ARC_SEGMENTS * 2
  const out = {
    positions: new Float32Array(n * 3),
    colors: new Float32Array(n * 3),
    progress: new Float32Array(n),
    slots: new Float32Array(n),
    births: new Float32Array(n),
    deaths: new Float32Array(n),
  }
  let v = 0
  for (const edge of trace.edges) {
    const a = shape.anchors[edge.from]!
    const b = shape.anchors[edge.to]!
    const c = control(a, b, shape.bow)
    const color = edge.flow > 0 ? OUT_COLOR : IN_COLOR
    for (let s = 0; s < ARC_SEGMENTS; s++) {
      for (const t of [s / ARC_SEGMENTS, (s + 1) / ARC_SEGMENTS]) {
        out.positions.set(bezier(a, c, b, t), v * 3)
        out.colors.set([color.r, color.g, color.b], v * 3)
        out.progress[v] = t
        out.slots[v] = edge.slot
        ;[out.births[v], out.deaths[v]] = edge.life
        v++
      }
    }
  }
  return out
}

function packets(trace: Trace, shape: FlowShape): FlowParticles {
  const heaviest = Math.log1p(Math.max(1, ...trace.edges.map((e) => e.weight)))
  const lengths = trace.edges.map(
    (e) =>
      PACKET_MIN +
      Math.round((PACKET_MAX - PACKET_MIN) * (Math.log1p(e.weight) / heaviest)),
  )
  const n = lengths.reduce((sum, k) => sum + k + DRIFT, 0)
  const out: FlowParticles = {
    starts: new Float32Array(n * 3),
    controls: new Float32Array(n * 3),
    ends: new Float32Array(n * 3),
    colors: new Float32Array(n * 3),
    slots: new Float32Array(n),
    offsets: new Float32Array(n),
    modes: new Float32Array(n),
    sizes: new Float32Array(n),
    births: new Float32Array(n),
    deaths: new Float32Array(n),
  }
  const random = rng(trace.edges.length + 7)
  let p = 0
  trace.edges.forEach((edge, e) => {
    const a = shape.anchors[edge.from]!
    const b = shape.anchors[edge.to]!
    const c = control(a, b, shape.bow)
    const color = edge.flow > 0 ? OUT_COLOR : IN_COLOR
    const packet = lengths[e]!
    for (let k = 0; k < packet + DRIFT; k++, p++) {
      const drift = k >= packet
      out.starts.set(a, p * 3)
      out.controls.set(c, p * 3)
      out.ends.set(b, p * 3)
      // The head burns white-hot; the tail cools to the flow's colour.
      const hot = drift ? 0 : Math.max(0, 1 - k * 0.5)
      out.colors.set(
        [
          color.r + (1 - color.r) * hot,
          color.g + (1 - color.g) * hot,
          color.b + (1 - color.b) * hot,
        ],
        p * 3,
      )
      out.slots[p] = edge.slot
      out.offsets[p] = drift ? random() : k * 0.035
      out.modes[p] = drift ? 1 : 0
      out.sizes[p] = shape.size * (drift ? 0.45 : 1.3 - (k / packet) * 0.8)
      ;[out.births[p], out.deaths[p]] = edge.life
    }
  })
  return out
}

function markers(trace: Trace, shape: FlowShape): FlowMarkers {
  const { lead } = trace
  const touched: number[] = []
  trace.focus.forEach((f, i) => f > 0 && touched.push(i))
  const n = touched.length
  const out: FlowMarkers = {
    positions: new Float32Array(n * 3),
    colors: new Float32Array(n * 3),
    sizes: new Float32Array(n),
    roots: new Float32Array(n),
    arrivals: new Float32Array(n),
    births: new Float32Array(n),
    deaths: new Float32Array(n),
  }
  touched.forEach((file, k) => {
    const root = trace.focus[file]! >= 1
    const out1 = trace.hopOut[file]!
    const in1 = trace.hopIn[file]!
    const color = root ? ROOT_COLOR : out1 > 0 ? OUT_COLOR : IN_COLOR
    out.positions.set(shape.anchors[file]!, k * 3)
    out.colors.set([color.r, color.g, color.b], k * 3)
    out.sizes[k] = shape.size * (root ? 9 : 3)
    out.roots[k] = root ? 1 : 0
    // A callee lights as its packet lands; a caller as its packet leaves.
    out.arrivals[k] = root ? lead : out1 > 0 ? lead + out1 : lead - in1
    ;[out.births[k], out.deaths[k]] = shape.lives[file]!
  })
  return out
}

/** Builds every buffer the trace overlay draws. */
export function flowOf(trace: Trace, shape: FlowShape): Flow {
  return {
    lines: arcLines(trace, shape),
    particles: packets(trace, shape),
    markers: markers(trace, shape),
    loop: trace.slots + 1,
  }
}
