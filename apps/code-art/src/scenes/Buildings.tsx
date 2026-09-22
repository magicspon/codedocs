import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, type JSX } from 'react'
import { MeshBasicMaterial, type InstancedMesh } from 'three'
import type { CityLayout } from '../lib/city-layout.ts'
import type { Focus } from './focus.ts'
import { facadeMaterial } from '../lib/facade-material.ts'
import type { Playhead } from '../lib/series.ts'
import { useLens } from './lens.ts'
import { useScan } from './scan.ts'
import type { SceneProps } from './scene.ts'
import { dress, ready, restack, runOf, type Run } from './stack.ts'

/** How wide one window is, as a share of a typical building's width. */
const WINDOW = 0.15

/** The instanced attributes one run of boxes feeds the facade shader. */
function Facade({ run }: { run: Run }): JSX.Element {
  return (
    <boxGeometry>
      <instancedBufferAttribute
        attach="attributes-aFacade"
        args={[run.facade, 2]}
      />
      <instancedBufferAttribute
        attach="attributes-aLamp"
        args={[run.lamp, 3]}
      />
      <instancedBufferAttribute
        attach="attributes-aHealth"
        args={[run.health, 4]}
      />
      <instancedBufferAttribute
        attach="attributes-aFile"
        args={[run.files, 1]}
      />
    </boxGeometry>
  )
}

/**
 * The towers: a shaft, its setbacks and a beacon mast, re-stacked whenever the
 * playhead moves. The window grid, the health lens and the alarm strobe all
 * live in the facade shader, so opening the lens or letting an alarm beat
 * costs two uniforms rather than 12,000 rewritten instances.
 */
export function Buildings(props: {
  layout: CityLayout
  playhead: Playhead
  lens: boolean
  focus: Focus
  /** The one file the search names, whose tower lights up; `null` otherwise. */
  pick: number | null
  onHover: SceneProps['onHover']
  onPick: SceneProps['onPick']
}): JSX.Element {
  const { layout, playhead, onHover, onPick, focus } = props
  const { buildings } = layout
  const shaft = useRef<InstancedMesh>(null)
  const tier = useRef<InstancedMesh>(null)
  const mast = useRef<InstancedMesh>(null)
  const drawn = useRef(Number.NaN)
  const lens = useLens(props.lens)
  const facades = useMemo(
    () => facadeMaterial(layout.unit * WINDOW),
    [layout.unit],
  )
  useEffect(() => {
    facades.uniforms.uFocusMap.value = focus.texture
    facades.uniforms.uFocusRows.value = focus.texture.image.height
  }, [facades, focus.texture])
  useScan(facades.uniforms, layout, props.pick, playhead)
  const beacons = useMemo(
    () => new MeshBasicMaterial({ toneMapped: false }),
    [],
  )
  const lit = useMemo(
    () => buildings.flatMap((b, i) => (b.beacon > 0 ? [i] : [])),
    [buildings],
  )
  const runs = useMemo(
    () => ({
      shaft: runOf(
        buildings,
        buildings.map((_, i) => i),
      ),
      tier: runOf(
        buildings,
        layout.tiers.map((t) => t.building),
      ),
    }),
    [buildings, layout.tiers],
  )

  useLayoutEffect(() => {
    const meshes = {
      shaft: shaft.current,
      tier: tier.current,
      mast: mast.current,
    }
    if (ready(meshes)) dress(meshes, layout, lit)
    drawn.current = Number.NaN
  }, [layout, lit])

  useFrame((state) => {
    facades.uniforms.uClock.value = state.clock.elapsedTime
    facades.uniforms.uLens.value = lens.current
    facades.uniforms.uFocus.value = focus.mix.current
    // Beacons would outshine the trace; a search banks them to embers.
    beacons.color.setScalar(1 - focus.mix.current * 0.85)
    const meshes = {
      shaft: shaft.current,
      tier: tier.current,
      mast: mast.current,
    }
    if (ready(meshes) && drawn.current !== playhead.t) {
      restack(meshes, layout, runs, lit, playhead.t)
      drawn.current = playhead.t
    }
  })

  return (
    <>
      <instancedMesh
        ref={shaft}
        args={[undefined, undefined, buildings.length]}
        material={facades.material}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => (
          e.stopPropagation(),
          onHover(e.instanceId ?? null)
        )}
        onPointerOut={() => onHover(null)}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          if (e.instanceId !== undefined) onPick(e.instanceId)
        }}
      >
        <Facade run={runs.shaft} />
      </instancedMesh>
      <instancedMesh
        ref={tier}
        args={[undefined, undefined, Math.max(layout.tiers.length, 1)]}
        material={facades.material}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => (
          e.stopPropagation(),
          onHover(layout.tiers[e.instanceId ?? -1]?.building ?? null)
        )}
        onPointerOut={() => onHover(null)}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          const building = layout.tiers[e.instanceId ?? -1]?.building
          if (building !== undefined) onPick(building)
        }}
      >
        <Facade run={runs.tier} />
      </instancedMesh>
      <instancedMesh
        ref={mast}
        args={[undefined, undefined, Math.max(lit.length, 1)]}
        // A mast is a light on a pole: it must not steal the pointer from its tower.
        raycast={() => null}
      >
        <boxGeometry />
        <primitive object={beacons} attach="material" />
      </instancedMesh>
    </>
  )
}
