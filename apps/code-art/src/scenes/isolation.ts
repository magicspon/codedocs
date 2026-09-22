import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type RefObject } from 'react'
import type { FlowShape } from '../lib/flow.ts'
import { gather } from '../lib/isolate.ts'
import type { Trace } from '../lib/trace.ts'
import { useGather, type Gathered } from './gather.ts'
import { useLens } from './lens.ts'

/** A scene's isolation, eased in and out. */
export interface Isolation {
  /** How far isolation has eased in, `0` to `1`; read it in `useFrame`. */
  readonly mix: RefObject<number>
  /** The shape with every traced file where isolation puts it; the plain shape when off. */
  readonly shape: FlowShape
  /** The trace's own light: faded out while the files travel, so no arc hangs where a file has left. */
  readonly flow: RefObject<number>
  /** Whether `file` is hidden, so it must not answer the pointer. */
  readonly hidden: (file: number) => boolean
}

/**
 * Isolates `trace` when `on`: every file it does not touch is hidden, and
 * the rest are gathered round the searched ones by `useGather`. `spacing` is
 * the gap between one hop's ring and the next. `focus` is the search's own
 * fade, which the trace's light is dimmed under.
 */
export function useIsolation(
  on: boolean,
  trace: Trace | null,
  shape: FlowShape,
  spacing: number,
  clouds: readonly Gathered[],
  focus: RefObject<number>,
): Isolation {
  const isolating = on && trace !== null
  const mix = useLens(isolating)
  const target = useMemo(
    () => (isolating ? gather(trace, shape.anchors, spacing) : null),
    [isolating, trace, shape, spacing],
  )
  useGather(target, shape.anchors.length, clouds)

  const moved = useMemo<FlowShape>(
    () =>
      target
        ? {
            ...shape,
            anchors: shape.anchors.map(
              ([x, y, z], i) =>
                [
                  x + target[i * 3]!,
                  y + target[i * 3 + 1]!,
                  z + target[i * 3 + 2]!,
                ] as const,
            ),
          }
        : shape,
    [shape, target],
  )

  // The arcs jump to where the files are going; they fade in as the files
  // arrive, and back in at home as they leave.
  const flow = useRef(0)
  useFrame(() => {
    const m = mix.current
    flow.current = focus.current * (isolating ? m ** 4 : (1 - m) ** 4)
  })

  return {
    mix,
    shape: moved,
    flow,
    hidden: (file) => isolating && trace.focus[file] === 0,
  }
}
