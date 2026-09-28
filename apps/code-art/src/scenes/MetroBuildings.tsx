import { useEffect, useMemo, type JSX } from 'react'
import { InstancedBufferAttribute, InstancedMesh, Matrix4 } from 'three'
import { Flag, SHAPES } from '../lib/metro-buildings.ts'
import type { Frames } from '../lib/metro-frames.ts'
import type { MetroLayout } from '../lib/metro-layout.ts'
import { ROLE_COLORS } from '../lib/palette.ts'
import type { Rgb } from '../lib/terrain-field.ts'
import { buildingMaterial, TIERS } from './metro-building-material.ts'
import type { MetroUniforms } from './metro-glsl.ts'
import { shapeGeometries } from './metro-shapes.ts'

/** One instanced mesh per shape, holding every building of that shape. */
function meshesOf(
  layout: MetroLayout,
  frames: Frames,
  tintOf: (file: number) => Rgb,
  shared: MetroUniforms,
): InstancedMesh[] {
  const { blocks, place } = layout
  const geometries = shapeGeometries()
  const matrix = new Matrix4()
  return SHAPES.map((shape) => {
    const files: number[] = []
    for (let i = 0; i < blocks.count; i++)
      if (blocks.shape[i] === shape) files.push(i)
    const geometry = geometries[shape]!
    const tint = new Float32Array(files.length * 3)
    const info = new Float32Array(files.length * 4)
    const health = new Float32Array(files.length * 4)
    const mesh = new InstancedMesh(
      geometry,
      buildingMaterial(shared, TIERS[shape]!),
      files.length,
    )
    files.forEach((i, k) => {
      const w = blocks.width[i]!
      const h = blocks.height[i]!
      const d = blocks.depth[i]!
      const x = frames.x
      const y = frames.y
      const z = frames.z
      const at = i * 3
      // Columns are the building's axes times its size, standing on its foot.
      matrix.set(
        x[at]! * w,
        y[at]! * h,
        z[at]! * d,
        place.foot[at]!,
        x[at + 1]! * w,
        y[at + 1]! * h,
        z[at + 1]! * d,
        place.foot[at + 1]!,
        x[at + 2]! * w,
        y[at + 2]! * h,
        z[at + 2]! * d,
        place.foot[at + 2]!,
        0,
        0,
        0,
        1,
      )
      mesh.setMatrixAt(k, matrix)
      tint.set(tintOf(i), k * 3)
      info.set(
        [blocks.lights[i]!, blocks.seed[i]!, blocks.kind[i]!, blocks.flags[i]!],
        k * 4,
      )
      health.set(blocks.health.subarray(i * 4, i * 4 + 4), k * 4)
    })
    geometry.setAttribute('aTint', new InstancedBufferAttribute(tint, 3))
    geometry.setAttribute('aInfo', new InstancedBufferAttribute(info, 4))
    geometry.setAttribute('aHealth', new InstancedBufferAttribute(health, 4))
    // The planet hides most of the city, but the mesh spans all of it, so
    // three's own culling would never skip it.
    mesh.frustumCulled = false
    return mesh
  })
}

/**
 * Every file's building. Tests glow in the test colour and config files in
 * the config colour; everything else takes its district's colour.
 */
export function MetroBuildings(props: {
  layout: MetroLayout
  frames: Frames
  district: (file: number) => Rgb
  shared: MetroUniforms
}): JSX.Element {
  const { layout, frames, district, shared } = props
  const meshes = useMemo(() => {
    const { flags } = layout.blocks
    const role = (k: number): Rgb => {
      const c = ROLE_COLORS[k]!
      return [c.r, c.g, c.b]
    }
    const tintOf = (i: number): Rgb =>
      flags[i]! & Flag.test
        ? role(1)
        : flags[i]! & Flag.config
          ? role(2)
          : district(i)
    return meshesOf(layout, frames, tintOf, shared)
  }, [layout, frames, district, shared])
  useEffect(
    () => () => {
      for (const m of meshes) {
        m.geometry.dispose()
        ;(m.material as { dispose(): void }).dispose()
      }
    },
    [meshes],
  )
  return (
    <>
      {meshes.map((mesh, k) => (
        <primitive key={k} object={mesh} />
      ))}
    </>
  )
}
