import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState, type JSX, type RefObject } from 'react'
import type { Group, PointLight, Vector3 } from 'three'
import { useSymbols } from '../hooks.ts'
import type { FileDatum } from '../lib/atlas.ts'
import { faded, nearby, nearness, reslot, spent } from '../lib/craft.ts'
import { moonsOf, orbitsOf } from '../lib/orbits.ts'
import { treeOf } from '../lib/symbol-tree.ts'
import { fadeAll } from './fade.ts'
import type { MoonsFor } from './Glimpses.tsx'
import { Orbit } from './Orbit.tsx'

/**
 * How many systems are drawn at once. Each costs a light, and every light is
 * paid for by every lit planet, so keep this modest.
 */
const SLOTS = 12
/** Seconds between looks round for stars; the craft is not that quick. */
const SCAN = 0.25

type Anchor = readonly [number, number, number]

/** Sizes and fades a system: grown by nearness, seen by nearness and fade together. */
function place(g: Group | null, grow: number, seen: number): void {
  if (!g) return
  // An ease-out on the scale, as when a picked file's planets unfold.
  g.scale.setScalar(Math.max(1 - (1 - grow) ** 3, 1e-4))
  g.visible = seen > 0
  fadeAll(g, seen)
}

/** Lights a system from its star, as bright as it is seen. */
function shine(
  l: PointLight | null,
  at: Anchor,
  seen: number,
  reach: number,
): void {
  if (!l) return
  l.position.set(...at)
  l.intensity = 4 * seen
  l.distance = reach * 3
}

/**
 * One star's planets and their moons, grown with the craft's nearness and
 * faded in once its names are in. Told it is `leaving`,
 * it fades out instead and calls `onGone` when it has. Its slot's light is
 * handed in, so the light is never mounted or unmounted: a change in the
 * number of lights would recompile every lit material.
 */
function NearSystem(props: {
  repo: string
  file: FileDatum
  at: Anchor
  range: number
  craft: RefObject<Vector3>
  light: RefObject<PointLight | null>
  leaving: boolean
  onGone: () => void
}): JSX.Element {
  const { file, at, range } = props
  const symbols = useSymbols(props.repo, file.path)
  const tree = useMemo(() => (symbols ? treeOf(symbols) : null), [symbols])
  const orbits = useMemo(() => orbitsOf(file, tree), [file, tree])
  const moonsFor = useMemo<MoonsFor | null>(
    () => (tree ? (s, size) => moonsOf(file.path, tree, s, size) : null),
    [file.path, tree],
  )
  const system = useRef<Group>(null)
  const shown = useRef(0)
  const gone = useRef(false)

  useFrame((_, delta) => {
    const c = props.craft.current
    const grow = nearness(
      Math.hypot(c.x - at[0], c.y - at[1], c.z - at[2]),
      range,
    )
    // Only starts once the rings are drawn, or the fade would be spent on nothing.
    shown.current = faded(
      shown.current,
      !props.leaving && symbols !== undefined,
      Math.min(delta, 1 / 30),
    )
    // One called back before it went is no longer going.
    const out = spent(props.leaving, shown.current, grow)
    if (out && !gone.current) props.onGone()
    gone.current = out
    const seen = grow * shown.current
    place(system.current, grow, seen)
    shine(props.light.current, at, seen, orbits.reach)
  })

  return (
    <group
      ref={system}
      position={at as [number, number, number]}
      visible={false}
    >
      {/* Drawn once the names are in, or known absent, so the rings never regroup in view. */}
      {symbols !== undefined &&
        orbits.rings.map((ring) => (
          <Orbit
            key={ring.kind}
            ring={ring}
            symbols={symbols}
            moonsFor={moonsFor}
            focused={null}
            highlight={null}
            onSelect={() => {}}
          />
        ))}
    </group>
  )
}

/**
 * A slot: a light always, and a system while a star holds the slot. A star
 * handed the slot fades in while the one before it fades out; the light
 * goes to the newcomer.
 */
function Slot(props: {
  repo: string
  files: readonly FileDatum[]
  file: number | null
  anchors: readonly Anchor[]
  ranges: readonly number[]
  craft: RefObject<Vector3>
}): JSX.Element {
  const light = useRef<PointLight>(null)
  const dark = useRef<PointLight>(null)
  const [held, setHeld] = useState<{
    file: number | null
    leaving: number | null
  }>({ file: props.file, leaving: null })
  // Handed a new star, the old one steps aside to fade out behind it.
  if (held.file !== props.file)
    setHeld({ file: props.file, leaving: held.file })
  const system = (file: number, leaving: boolean): JSX.Element => (
    <NearSystem
      key={file}
      repo={props.repo}
      file={props.files[file]!}
      at={props.anchors[file]!}
      range={props.ranges[file]!}
      craft={props.craft}
      light={leaving ? dark : light}
      leaving={leaving}
      onGone={() =>
        setHeld((h) => (h.leaving === file ? { ...h, leaving: null } : h))
      }
    />
  )
  return (
    <>
      <pointLight ref={light} intensity={0} decay={0} />
      {held.file !== null && system(held.file, false)}
      {held.leaving !== null && system(held.leaving, true)}
    </>
  )
}

/**
 * The planets and moons of the stars round the craft, growing out of each
 * star as it comes near and folding back as it falls behind. A star shows
 * from `ranges[i]` away; `skip` is the picked file, whose own system is
 * already drawn. Drawn inside the galaxy's group, whose frame `craft` is in.
 */
export function Nearby(props: {
  repo: string
  files: readonly FileDatum[]
  anchors: readonly Anchor[]
  ranges: readonly number[]
  craft: RefObject<Vector3>
  skip: number | null
}): JSX.Element {
  const [slots, setSlots] = useState<(number | null)[]>(() =>
    Array.from({ length: SLOTS }, () => null),
  )
  const wait = useRef(0)

  useFrame((_, delta) => {
    wait.current -= delta
    if (wait.current > 0) return
    wait.current = SCAN
    const shown = slots.filter((f) => f !== null)
    const near = nearby(
      props.anchors,
      props.ranges,
      props.craft.current,
      SLOTS + 1,
      shown,
    )
      .filter((f) => f !== props.skip)
      .slice(0, SLOTS)
    const next = reslot(slots, near)
    if (next) setSlots(next)
  })

  return (
    <>
      {slots.map((file, i) => (
        <Slot
          key={i}
          repo={props.repo}
          files={props.files}
          file={file}
          anchors={props.anchors}
          ranges={props.ranges}
          craft={props.craft}
        />
      ))}
    </>
  )
}
