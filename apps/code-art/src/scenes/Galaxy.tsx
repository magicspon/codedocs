import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type JSX } from 'react'
import { Vector3, type Group, type Points } from 'three'
import { approach, type Shot } from '../lib/flight.ts'
import { galaxyLayout } from '../lib/galaxy-layout.ts'
import {
  glowMaterial,
  healthGlowMaterial,
  lifeLineMaterial,
} from '../lib/glow.ts'
import { healthTexture } from '../lib/health-texture.ts'
import { visibility } from '../lib/series.ts'
import { orbitsOf, reachOf, SYSTEM_VIEW } from '../lib/orbits.ts'
import { Craft, useLanding } from './Craft.tsx'
import { useFlight } from './fly.ts'
import { useFocus } from './focus.ts'
import { Aim, Cloud, Lines, useSpin } from './galaxy-parts.tsx'
import { useIsolation } from './isolation.ts'
import { useLens } from './lens.ts'
import { Nearby } from './Nearby.tsx'
import { Planets } from './Planets.tsx'
import type { SceneProps } from './scene.ts'
import { TraceFlow } from './TraceFlow.tsx'

/**
 * The codebase as a spiral galaxy: arms are top-level directories, the core is
 * the code everything else leans on, stars are symbols, red haze is blind spots.
 * Over a timeline, stars ignite as their file gains symbols. Under the health
 * lens, hotspots flare (pulsing when heating up, dull red when cooling),
 * unused files grey out and copies pair up. Under a search, the rest of the
 * sky dims and light runs the calls through the files that matched. Pick one
 * file and the galaxy stops turning, the camera flies to its star, and its
 * symbols swing out round it as planets. Isolate it, and everything the
 * trace does not reach goes out, while what it does reach is drawn in round
 * the pick, a ring per hop: callers above, callees below. Take off, and the
 * camera rides a little spacecraft instead, and each star's planets and
 * moons grow out of it as the craft draws near.
 */
export function Galaxy(props: SceneProps): JSX.Element {
  const { series, playhead, onHover } = props
  const layout = useMemo(() => galaxyLayout(series), [series])
  const health = useMemo(
    () => healthTexture(layout.health, series.merged.files.length),
    [layout, series],
  )
  const materials = useMemo(
    () => ({
      nebulae: glowMaterial(),
      // A hot file's core blazes; its stars only warm, or the arm would drown.
      stars: healthGlowMaterial(0.25),
      cores: healthGlowMaterial(1),
      links: lifeLineMaterial(),
      clones: lifeLineMaterial(),
    }),
    [],
  )
  useEffect(() => {
    for (const m of [materials.stars, materials.cores]) {
      m.uniforms.uHealth!.value = health.texture
      m.uniforms.uHealthRows!.value = health.texture.image.height
    }
    return () => health.texture.dispose()
  }, [health, materials])
  const lens = useLens(props.lens)
  const focus = useFocus(props.trace, series.merged.files.length)
  useEffect(() => {
    for (const m of [materials.stars, materials.cores]) {
      m.uniforms.uFocusMap!.value = focus.texture
      m.uniforms.uFocusRows!.value = focus.texture.image.height
    }
  }, [focus.texture, materials])
  const shape = useMemo(
    () => ({
      anchors: Array.from({ length: series.merged.files.length }, (_, i) => {
        const p = layout.cores.positions
        return [p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!] as const
      }),
      bow: 0.22,
      size: 0.55,
      lives: series.fileLife,
    }),
    [layout, series],
  )
  const group = useRef<Group>(null)
  const trace = props.trace
  const pick = trace?.roots.length === 1 ? trace.roots[0]! : null
  const cores = useRef<Points>(null)
  const stars = useRef<Points>(null)
  const gathered = useMemo(
    () => [
      { cloud: layout.cores, points: cores, bounds: true },
      { cloud: layout.stars, points: stars, bounds: false },
    ],
    [layout],
  )
  // The first ring clears the pick's planets; with several picks, a star's width.
  const spacing =
    pick === null ? 3 : orbitsOf(series.merged.files[pick]!, null).reach * 1.4
  const isolation = useIsolation(
    props.isolate ?? false,
    trace,
    shape,
    spacing,
    gathered,
    focus.mix,
  )
  // Moons' links name their far files by path.
  const starOf = useMemo(() => {
    const index = new Map(series.merged.files.map((f, i) => [f.path, i]))
    return (path: string) => {
      const i = index.get(path)
      return i === undefined ? undefined : isolation.shape.anchors[i]
    }
  }, [series, isolation.shape])
  const planets = useRef(0)
  const picked = useMemo(
    () =>
      pick === null
        ? null
        : { file: series.merged.files[pick]!, at: shape.anchors[pick]! },
    [pick, series, shape],
  )
  const flying = props.fly ?? false
  // Where the craft is, in the galaxy's frame, and where it last looked.
  const craft = useRef(new Vector3())
  const ahead = useRef<Vector3 | null>(null)
  // A star shows its planets from this far out: well beyond the view of its
  // system, so they are already there as the craft closes in.
  const ranges = useMemo(
    () => series.merged.files.map((f) => reachOf(f) * SYSTEM_VIEW * 12),
    [series],
  )
  useLanding(flying, ahead)
  // Held still while flying, or every star would slide past the craft.
  useSpin(group, pick === null && !flying)
  useFlight(
    pick,
    (file: number, from: Shot) => {
      const star = new Vector3(...shape.anchors[file]!)
      group.current?.localToWorld(star)
      const reach = orbitsOf(series.merged.files[file]!, null).reach
      return approach(from, star, reach * SYSTEM_VIEW, 0.5)
    },
    0.15,
  )

  useFrame((state) => {
    for (const m of Object.values(materials))
      m.uniforms.uTime!.value = playhead.t
    health.follow(playhead.t, lens.current)
    for (const m of [materials.stars, materials.cores]) {
      m.uniforms.uLens!.value = lens.current
      m.uniforms.uClock!.value = state.clock.elapsedTime
      m.uniforms.uFocus!.value = focus.mix.current
      m.uniforms.uIsolate!.value = isolation.mix.current
    }
    // The picked file's star cloud gathers into its planets.
    materials.stars.uniforms.uAbsorb!.value = planets.current
    // A search quiets everything but itself: its own arcs carry the calls.
    // Isolation takes the rest away altogether: threads and haze belong to files it hides.
    const quiet = (1 - focus.mix.current * 0.88) * (1 - isolation.mix.current)
    materials.clones.uniforms.uOpacity!.value = lens.current * quiet
    materials.links.uniforms.uOpacity!.value = quiet
    materials.nebulae.uniforms.uDim!.value = quiet
  })

  // A file not yet written at this point in history is still in the buffer; it must not answer the pointer.
  const present = (file: number): boolean =>
    visibility(series.fileLife[file]!, playhead.t) > 0.5 &&
    !isolation.hidden(file)
  const hover = (file: number | null): void =>
    onHover(file !== null && present(file) ? file : null)

  return (
    <>
      <color attach="background" args={['#020208']} />
      <PerspectiveCamera
        makeDefault
        position={[0, layout.radius * 0.9, layout.radius * 1.5]}
        fov={55}
        near={0.01}
        far={layout.radius * 20}
      />
      <group ref={group}>
        <Cloud cloud={layout.nebulae} material={materials.nebulae} />
        <Lines threads={layout.links} material={materials.links} />
        <Lines threads={layout.clones} material={materials.clones} />
        <Cloud ref={stars} cloud={layout.stars} material={materials.stars} />
        <Cloud
          ref={cores}
          cloud={layout.cores}
          material={materials.cores}
          onHover={hover}
          onPick={(file) => present(file) && props.onPick(file)}
        />
        <TraceFlow
          trace={props.trace}
          shape={isolation.shape}
          files={series.merged.files}
          playhead={playhead}
          focus={isolation.flow}
          scale={300}
        />
        <Planets
          repo={series.merged.name}
          pick={picked}
          grow={planets}
          starOf={starOf}
          onClaims={props.onClaims}
        />
        {flying && (
          <Nearby
            repo={series.merged.name}
            files={series.merged.files}
            anchors={shape.anchors}
            ranges={ranges}
            craft={craft}
            skip={pick}
          />
        )}
        {props.aim != null && (
          <Aim
            at={isolation.shape.anchors[props.aim]!}
            path={series.merged.files[props.aim]!.path}
          />
        )}
      </group>
      {flying ? (
        <Craft
          galaxy={group}
          anchors={shape.anchors}
          local={craft}
          ahead={ahead}
        />
      ) : (
        <OrbitControls
          makeDefault
          enableDamping
          maxDistance={layout.radius * 4}
        />
      )}
    </>
  )
}
