import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useState, type JSX, type RefObject } from 'react'
import type { FileDatum } from '../lib/atlas.ts'
import { flowMaterials } from '../lib/flow-material.ts'
import { flowOf, type Flow, type FlowShape } from '../lib/flow.ts'
import type { Playhead } from '../lib/series.ts'
import type { Trace } from '../lib/trace.ts'

/** Numbers each built flow, so a new trace remounts fresh buffers. */
let built = 0

/** Names shown over searched files; past this many they would bury the picture. */
const MAX_LABELS = 8

/** Attaches `[array, itemSize]` pairs to a `bufferGeometry`. */
function Attributes(props: {
  attrs: Record<string, readonly [Float32Array, number]>
}): JSX.Element {
  return (
    <>
      {Object.entries(props.attrs).map(([name, [array, size]]) => (
        <bufferAttribute
          key={name}
          attach={`attributes-${name}`}
          args={[array, size]}
        />
      ))}
    </>
  )
}

function Labels(props: {
  trace: Trace
  shape: FlowShape
  files: readonly FileDatum[]
}): JSX.Element {
  return (
    <>
      {props.trace.roots.slice(0, MAX_LABELS).map((file) => {
        const path = props.files[file]!.path
        return (
          <Html
            key={file}
            position={props.shape.anchors[file] as [number, number, number]}
            center
            zIndexRange={[10, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <span className="trace-label">
              {path.slice(path.lastIndexOf('/') + 1)}
            </span>
          </Html>
        )
      })}
    </>
  )
}

function Geometry({
  flow,
  mats,
}: {
  flow: Flow
  mats: ReturnType<typeof flowMaterials>
}): JSX.Element {
  const { lines, particles, markers } = flow
  return (
    <>
      <lineSegments material={mats.lines} raycast={() => null}>
        <bufferGeometry>
          <Attributes
            attrs={{
              position: [lines.positions, 3],
              color: [lines.colors, 3],
              progress: [lines.progress, 1],
              slot: [lines.slots, 1],
              birth: [lines.births, 1],
              death: [lines.deaths, 1],
            }}
          />
        </bufferGeometry>
      </lineSegments>
      {/* Particles place themselves in the shader, so their bounds mean nothing to the culler. */}
      <points
        material={mats.particles}
        frustumCulled={false}
        raycast={() => null}
      >
        <bufferGeometry>
          <Attributes
            attrs={{
              position: [particles.starts, 3],
              start: [particles.starts, 3],
              ctrl: [particles.controls, 3],
              end: [particles.ends, 3],
              color: [particles.colors, 3],
              slot: [particles.slots, 1],
              offset: [particles.offsets, 1],
              mode: [particles.modes, 1],
              size: [particles.sizes, 1],
              birth: [particles.births, 1],
              death: [particles.deaths, 1],
            }}
          />
        </bufferGeometry>
      </points>
      <points material={mats.markers} raycast={() => null}>
        <bufferGeometry>
          <Attributes
            attrs={{
              position: [markers.positions, 3],
              color: [markers.colors, 3],
              size: [markers.sizes, 1],
              root: [markers.roots, 1],
              arrival: [markers.arrivals, 1],
              birth: [markers.births, 1],
              death: [markers.deaths, 1],
            }}
          />
        </bufferGeometry>
      </points>
    </>
  )
}

/**
 * The trace drawn over a scene: arcs between traced files, packets of light
 * running them caller to callee in hop order, and markers that flash as the
 * light lands. The last trace lingers while the overlay fades out, so clearing
 * a search dissolves it rather than cutting it.
 */
export function TraceFlow(props: {
  trace: Trace | null
  shape: FlowShape
  files: readonly FileDatum[]
  playhead: Playhead
  /** How far the search's focus has eased in, from `useFocus`. */
  focus: RefObject<number>
  /** Point size scale, matching the scene's own glows. */
  scale: number
}): JSX.Element | null {
  const { shape } = props
  const mats = useMemo(() => flowMaterials(props.scale), [props.scale])
  const [shown, setShown] = useState(props.trace)
  useEffect(() => {
    if (props.trace) setShown(props.trace)
  }, [props.trace])
  const flow = useMemo(() => shown && flowOf(shown, shape), [shown, shape])
  const id = useMemo(() => (flow ? ++built : 0), [flow])

  useFrame((state) => {
    const u = mats.uniforms
    u.uClock.value = state.clock.elapsedTime
    u.uHistory.value = props.playhead.t
    u.uOpacity.value = props.focus.current
    u.uLoop.value = flow?.loop ?? 1
  })
  useEffect(
    () => () => {
      mats.lines.dispose()
      mats.particles.dispose()
      mats.markers.dispose()
    },
    [mats],
  )

  if (!shown || !flow) return null
  return (
    <group>
      {/* Keyed so a new trace mounts fresh buffers rather than resizing old ones. */}
      <Geometry key={id} flow={flow} mats={mats} />
      {props.trace && (
        <Labels trace={shown} shape={shape} files={props.files} />
      )}
    </group>
  )
}
