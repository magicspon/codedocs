import { PerspectiveCamera } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, type JSX } from 'react'
import { BufferAttribute, BufferGeometry, Color } from 'three'
import { galaxyPalette } from '../lib/galaxy-palette.ts'
import { framesOf } from '../lib/metro-frames.ts'
import { metroLayout } from '../lib/metro-layout.ts'
import { ribbonsOf } from '../lib/metro-ribbons.ts'
import { groundColors } from '../lib/terrain-layout.ts'
import { Buggy } from './Buggy.tsx'
import { MetroAir } from './MetroAir.tsx'
import { MetroBuildings } from './MetroBuildings.tsx'
import { MetroRain } from './MetroRain.tsx'
import { MetroSigns } from './MetroSigns.tsx'
import { MetroSkyTags } from './MetroSkyTags.tsx'
import { MetroTagged } from './MetroTagged.tsx'
import { groundMaterial, roadMaterial } from './metro-ground-material.ts'
import { metroUniforms } from './metro-glsl.ts'
import type { SceneProps } from './scene.ts'

/** Ground triangles about this many world units across; finer would only cost. */
const GROUND_CELL = 4

/**
 * The codebase as a small neon planet, driven round in a buggy. Every file
 * is a building; the folder tree lays out the districts and paves their
 * avenues from the root at the north pole; calls ride the roads as traffic
 * and fly roof to roof as sky lanes. The planet is small, so the horizon is
 * near: most of the city is round the curve, and its tallest towers and
 * brightest beams rise over it to steer by. An art piece: it names the file
 * ahead, and draws the latest state of a timeline.
 */
export function Metro(props: SceneProps): JSX.Element {
  const { series, onHover } = props
  const layout = useMemo(() => metroLayout(series), [series])
  const frames = useMemo(() => framesOf(layout.place), [layout])
  const { files, name } = series.merged
  const looks = useMemo(() => {
    const hue = galaxyPalette(name, files).hue / 360
    const tint = groundColors(name, files)
    return {
      tint,
      district: (file: number) => tint(layout.angles[file]!),
      fog: new Color().setHSL(hue, 0.55, 0.045),
      glow: new Color().setHSL((hue + 0.12) % 1, 0.9, 0.3),
      neon: new Color().setHSL((hue + 0.5) % 1, 1, 0.6),
    }
  }, [name, files, layout])
  const shared = useMemo(
    () => metroUniforms(looks.fog, layout.radius),
    [looks, layout],
  )
  const materials = useMemo(
    () => ({ ground: groundMaterial(shared), road: roadMaterial(shared) }),
    [shared],
  )
  const roads = useMemo(() => {
    const r = ribbonsOf(layout.roads, layout.radius, looks.tint)
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(r.positions, 3))
    g.setAttribute('uv', new BufferAttribute(r.uvs, 2))
    g.setAttribute('info', new BufferAttribute(r.info, 4))
    g.setAttribute('jam', new BufferAttribute(r.jams, 3))
    g.setAttribute('tint', new BufferAttribute(r.tints, 3))
    g.setIndex(new BufferAttribute(r.index, 1))
    return g
  }, [layout, looks])
  useEffect(
    () => () => {
      materials.ground.dispose()
      materials.road.dispose()
      roads.dispose()
    },
    [materials, roads],
  )
  useFrame((state) => void (shared.uClock.value = state.clock.elapsedTime))
  // An icosahedron's edge is about its radius; split so each is a ground cell.
  const detail = Math.min(96, Math.ceil(layout.radius / GROUND_CELL))

  return (
    <>
      <color attach="background" args={[looks.fog]} />
      <PerspectiveCamera
        makeDefault
        fov={68}
        near={0.1}
        far={layout.radius * 6}
      />
      <mesh material={materials.ground}>
        <icosahedronGeometry args={[layout.radius, detail]} />
      </mesh>
      <mesh geometry={roads} material={materials.road} frustumCulled={false} />
      <MetroBuildings
        layout={layout}
        frames={frames}
        district={looks.district}
        shared={shared}
      />
      <MetroSigns
        files={files}
        layout={layout}
        frames={frames}
        shared={shared}
      />
      <MetroAir layout={layout} shared={shared} glow={looks.glow} />
      <MetroRain />
      <MetroTagged layout={layout} files={files} />
      <MetroSkyTags layout={layout} files={files} />
      <Buggy
        layout={layout}
        frames={frames}
        neon={looks.neon}
        onAhead={onHover}
      />
    </>
  )
}
