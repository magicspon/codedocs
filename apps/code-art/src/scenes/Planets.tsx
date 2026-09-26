import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState, type JSX, type RefObject } from 'react'
import { Vector3, type Group } from 'three'
import { useSymbols } from '../hooks.ts'
import { isTest, type FileDatum, type FileSymbols } from '../lib/atlas.ts'
import { approach } from '../lib/flight.ts'
import { lightFrom } from '../lib/star-lit.ts'
import {
  moonsOf,
  orbitsOf,
  SYSTEM_VIEW,
  systemsAlong,
  type System as Rings,
} from '../lib/orbits.ts'
import { moonLinksOf } from '../lib/moon-links.ts'
import { treeOf } from '../lib/symbol-tree.ts'
import {
  AT_STAR,
  bodiesOf,
  claimsOf,
  NO_CLAIMS,
  select,
  type SystemClaims,
  type SystemNav,
} from '../lib/system-nav.ts'
import { useFollow } from './follow.ts'
import type { MoonsFor } from './Glimpses.tsx'
import { MoonLinks, type StarOf } from './MoonLinks.tsx'
import { Orbit } from './Orbit.tsx'
import { BlackHole } from './BlackHole.tsx'
import { Sun } from './Sun.tsx'
import { useReportClaims, useSystemKeys } from './system-keys.ts'

/** A picked file, and where its star sits in the galaxy. */
export interface Pick {
  readonly file: FileDatum
  readonly at: readonly [number, number, number]
}

/**
 * Eases `grow` towards `open` and scales `system` to match. Slower than the
 * lens: the planets should still be unfurling as the camera lands.
 */
function useUnfold(
  open: boolean,
  grow: { current: number },
  system: RefObject<Group | null>,
): void {
  useFrame((_, delta) => {
    const target = open ? 1 : 0
    const next =
      grow.current + (target - grow.current) * Math.min(1, delta * 2.2)
    grow.current = Math.abs(target - next) < 0.002 ? target : next
    const g = system.current
    if (!g) return
    // An ease-out on the scale, so they fly out fast and settle into orbit.
    g.scale.setScalar(Math.max(1 - (1 - grow.current) ** 3, 1e-4))
    g.visible = grow.current > 0
    lightFrom(g)
  })
}

/**
 * One level of a system: its rings, and at the focused body on them, the
 * next level down. `systems[depth]` is this level; `focus[depth]` is the
 * symbol focused on it, if the focus reaches this deep.
 */
function Satellites(props: {
  systems: readonly Rings[]
  focus: readonly number[]
  depth: number
  symbols: FileSymbols | null
  anchor: RefObject<Group | null>
  moonsFor: MoonsFor | null
  /** The body picked out by keyboard on the level being looked at. */
  highlight: number | null
  onSelect: (depth: number, symbol: number) => void
}): JSX.Element {
  const { systems, focus, depth } = props
  const here = focus[depth]
  // Only the deepest focused body holds the camera's anchor.
  const deepest = depth === systems.length - 2
  return (
    <>
      {systems[depth]!.rings.map((ring, i) => (
        <Orbit
          key={i}
          ring={ring}
          symbols={props.symbols}
          moonsFor={props.moonsFor}
          highlight={depth === systems.length - 1 ? props.highlight : null}
          onSelect={(symbol) => props.onSelect(depth, symbol)}
          focused={
            here === undefined || depth + 1 >= systems.length
              ? null
              : {
                  symbol: here,
                  anchor: deepest ? props.anchor : null,
                  moons: <Satellites {...props} depth={depth + 1} />,
                }
          }
        />
      ))}
    </>
  )
}

const star = new Vector3()

/**
 * One file's system, drawn at its star. Clicking a body flies the camera to
 * it and shows its moons; clicking a body already focused steps back out to
 * the level it circles in. Shift and the arrows do the same by keyboard, and
 * Enter and Escape zoom in and out when there is somewhere to go.
 */
function System(props: {
  repo: string
  shown: Pick
  open: boolean
  system: RefObject<Group | null>
  starOf: StarOf
  onClaims: ((claims: SystemClaims) => void) | undefined
}): JSX.Element {
  const { file, at } = props.shown
  // Read on the first pick, not before: names can outweigh the dataset.
  const symbols = useSymbols(props.repo, file.path)
  const tree = useMemo(() => (symbols ? treeOf(symbols) : null), [symbols])
  const orbits = useMemo(() => orbitsOf(file, tree), [file, tree])
  // Stable per tree, so each ring lays out its glimpsed moons once.
  const moonsFor = useMemo<MoonsFor | null>(
    () => (tree ? (s, size) => moonsOf(file.path, tree, s, size) : null),
    [file.path, tree],
  )
  // The walk belongs to the pick it was made under; a new pick starts at the star.
  const [held, setHeld] = useState({ pick: props.shown, nav: AT_STAR })
  const nav = props.open && held.pick === props.shown ? held.nav : AT_STAR
  const { focus } = nav
  const systems = useMemo(
    () => (tree ? systemsAlong(file.path, tree, orbits, focus) : [orbits]),
    [file.path, tree, orbits, focus],
  )
  // Once a body is focused, its moons' calls and references run off them.
  const links = useMemo(
    () => (symbols && props.open ? moonLinksOf(symbols, systems, focus) : []),
    [symbols, props.open, systems, focus],
  )
  const anchor = useRef<Group>(null)
  const go = (next: SystemNav): void =>
    setHeld({ pick: props.shown, nav: next })
  const active = props.open && symbols != null
  const claims = active
    ? claimsOf(nav, (s) => tree?.children[s]?.length ?? 0)
    : NO_CLAIMS
  useSystemKeys(active, nav, bodiesOf(systems.at(-1)!), claims, go)
  useReportClaims(claims, props.onClaims)
  useFollow(
    anchor,
    props.open ? focus.join('/') : null,
    systems.at(-1)!.reach * SYSTEM_VIEW,
    (from) => {
      props.system.current?.getWorldPosition(star)
      return approach(from, star, orbits.reach * SYSTEM_VIEW, 0.5)
    },
  )
  return (
    <>
      <group ref={props.system} position={at} visible={false}>
        {/* The star lights its own planets and moons, through their material. */}
        {isTest(file) ? (
          <BlackHole rings={symbols === undefined ? [] : orbits.rings} />
        ) : (
          <Sun />
        )}
        {/* Drawn once the names are in, or known absent, so the rings never regroup in view. */}
        {symbols !== undefined && (
          <Satellites
            systems={systems}
            focus={focus}
            depth={0}
            symbols={symbols}
            anchor={anchor}
            moonsFor={moonsFor}
            highlight={nav.highlight}
            onSelect={(depth, symbol) => go(select(nav, depth, symbol))}
          />
        )}
      </group>
      <MoonLinks
        links={links}
        anchor={anchor}
        system={props.system}
        starOf={props.starOf}
      />
    </>
  )
}

/**
 * A picked file's symbols as planets round its star, one orbit per kind. They
 * swing out from the star when the file is picked and fold back into it when
 * the pick is cleared. `grow` reports how far out they are, `0` to `1`, so the
 * galaxy can hand the file's own star cloud over to its planets. Hovering a
 * planet names its symbol; clicking one zooms in to its moons, and lines run
 * off those moons to what they call and reference.
 */
export function Planets(props: {
  /** The repository's name, which its symbol names are filed under. */
  repo: string
  pick: Pick | null
  grow: { current: number }
  /** Where each file's star is, for the lines that run off to them. */
  starOf: StarOf
  onClaims?: (claims: SystemClaims) => void
}): JSX.Element | null {
  const system = useRef<Group>(null)
  // The last pick stays drawn while its planets fold away.
  const last = useRef(props.pick)
  last.current = props.pick ?? last.current
  useUnfold(props.pick !== null, props.grow, system)
  if (!last.current) return null
  return (
    <System
      key={last.current.file.path}
      repo={props.repo}
      shown={last.current}
      open={props.pick !== null}
      system={system}
      starOf={props.starOf}
      onClaims={props.onClaims}
    />
  )
}
