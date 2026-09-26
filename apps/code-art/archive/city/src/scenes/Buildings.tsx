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
import { dress, ready, restack } from './stack.ts'

/**
 * Every settlement's buildings: one instanced mesh across the whole city,
 * re-stacked whenever the playhead moves, plus a mast on each settlement
 * that earned a beacon. The lens, the alarm strobe, the scan and the search
 * focus all live in the facade shader, so opening the lens or letting an
 * alarm beat costs uniforms rather than hundreds of thousands of rewritten
 * instances.
 */
export function Buildings(props: {
  layout: CityLayout
  playhead: Playhead
  lens: boolean
  focus: Focus
  /** The one file the search names, whose settlement lights up; `null` otherwise. */
  pick: number | null
  onHover: SceneProps['onHover']
  onPick: SceneProps['onPick']
}): JSX.Element {
  const { layout, playhead, onHover, onPick, focus } = props
  const { buildings } = layout
  const shaft = useRef<InstancedMesh>(null)
  const mast = useRef<InstancedMesh>(null)
  const drawn = useRef(Number.NaN)
  const lens = useLens(props.lens)
  const facades = useMemo(facadeMaterial, [])
  useEffect(() => {
    facades.uniforms.uFocusMap.value = focus.texture
    facades.uniforms.uFocusRows.value = focus.texture.image.height
  }, [facades, focus.texture])
  useScan(facades.uniforms, layout, props.pick)
  const beacons = useMemo(
    () => new MeshBasicMaterial({ toneMapped: false }),
    [],
  )
  const lit = useMemo(
    () =>
      layout.settlements.flatMap((s, i) =>
        layout.beacons[s.file]! > 0 ? [i] : [],
      ),
    [layout],
  )
  const health = useMemo(
    () => new Float32Array(buildings.count * 4),
    [buildings],
  )

  useLayoutEffect(() => {
    const meshes = { shaft: shaft.current, mast: mast.current }
    if (ready(meshes)) dress(meshes, layout, lit)
    drawn.current = Number.NaN
  }, [layout, lit])

  useFrame((state) => {
    facades.uniforms.uClock.value = state.clock.elapsedTime
    facades.uniforms.uLens.value = lens.current
    facades.uniforms.uFocus.value = focus.mix.current
    // Beacons would outshine the trace; a search banks them to embers.
    beacons.color.setScalar(1 - focus.mix.current * 0.85)
    const meshes = { shaft: shaft.current, mast: mast.current }
    if (ready(meshes) && drawn.current !== playhead.t) {
      restack(meshes, layout, health, lit, playhead.t)
      drawn.current = playhead.t
    }
  })

  return (
    <>
      <instancedMesh
        ref={shaft}
        args={[undefined, undefined, buildings.count]}
        material={facades.material}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => (
          e.stopPropagation(),
          onHover(
            e.instanceId !== undefined ? buildings.file[e.instanceId]! : null,
          )
        )}
        onPointerOut={() => onHover(null)}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          if (e.instanceId !== undefined) onPick(buildings.file[e.instanceId]!)
        }}
      >
        <boxGeometry>
          <instancedBufferAttribute
            attach="attributes-aLit"
            args={[buildings.lit, 1]}
          />
          <instancedBufferAttribute
            attach="attributes-aSeed"
            args={[buildings.seed, 1]}
          />
          <instancedBufferAttribute
            attach="attributes-aLamp"
            args={[buildings.lamp, 3]}
          />
          <instancedBufferAttribute
            attach="attributes-aHealth"
            args={[health, 4]}
          />
          <instancedBufferAttribute
            attach="attributes-aFile"
            args={[buildings.file, 1]}
          />
        </boxGeometry>
      </instancedMesh>
      <instancedMesh
        ref={mast}
        args={[undefined, undefined, Math.max(lit.length, 1)]}
        // A mast is a light on a pole: it must not steal the pointer from its settlement.
        raycast={() => null}
      >
        <boxGeometry />
        <primitive object={beacons} attach="material" />
      </instancedMesh>
    </>
  )
}
