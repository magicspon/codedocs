import { useEffect, useMemo, type JSX } from 'react'
import { BufferAttribute, BufferGeometry } from 'three'
import type { FileDatum } from '../lib/atlas.ts'
import type { Frames } from '../lib/metro-frames.ts'
import type { MetroLayout } from '../lib/metro-layout.ts'
import { signsOf, type Signs } from '../lib/metro-signs.ts'
import { KIND_COLORS } from '../lib/palette.ts'
import type { MetroUniforms } from './metro-glsl.ts'
import { namesTexture, signMaterial } from './metro-sign-material.ts'

/** One quad per sign, carrying its slot in the names texture and its colour. */
function panels(signs: Signs, kinds: Uint8Array): BufferGeometry {
  const n = signs.files.length
  // Each corner starts at the sign's middle; the shader spreads it out to face the camera.
  const positions = new Float32Array(n * 12)
  const upright = new Float32Array(n * 12)
  const corner = new Float32Array(n * 8)
  const size = new Float32Array(n * 8)
  const uvs = new Float32Array(n * 8)
  const slot = new Float32Array(n * 4)
  const ink = new Float32Array(n * 12)
  const seed = new Float32Array(n * 4)
  const out = new Float32Array(n * 12)
  const blade = new Float32Array(n * 4)
  const index: number[] = []
  const corners = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const
  for (let s = 0; s < n; s++) {
    const color = KIND_COLORS[kinds[signs.files[s]!]!]!
    corners.forEach(([a, b], k) => {
      const v = s * 4 + k
      positions.set(signs.middle.subarray(s * 3, s * 3 + 3), v * 3)
      upright.set(signs.up.subarray(s * 3, s * 3 + 3), v * 3)
      corner.set([a, b], v * 2)
      size.set(signs.size.subarray(s * 2, s * 2 + 2), v * 2)
      uvs.set([(a + 1) / 2, (b + 1) / 2], v * 2)
      slot[v] = s
      ink.set([color.r, color.g, color.b], v * 3)
      seed[v] = (s * 0.618034) % 1
      out.set(signs.out.subarray(s * 3, s * 3 + 3), v * 3)
      blade[v] = signs.blade[s]!
    })
    index.push(s * 4, s * 4 + 1, s * 4 + 2, s * 4 + 2, s * 4 + 1, s * 4 + 3)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(positions, 3))
  g.setAttribute('upright', new BufferAttribute(upright, 3))
  g.setAttribute('corner', new BufferAttribute(corner, 2))
  g.setAttribute('size', new BufferAttribute(size, 2))
  g.setAttribute('uv', new BufferAttribute(uvs, 2))
  g.setAttribute('slot', new BufferAttribute(slot, 1))
  g.setAttribute('ink', new BufferAttribute(ink, 3))
  g.setAttribute('seed', new BufferAttribute(seed, 1))
  g.setAttribute('outward', new BufferAttribute(out, 3))
  g.setAttribute('blade', new BufferAttribute(blade, 1))
  g.setIndex(index)
  return g
}

/** Billboards naming the busiest files, on their roofs, in their main kind's colour. */
export function MetroSigns(props: {
  files: readonly FileDatum[]
  layout: MetroLayout
  frames: Frames
  shared: MetroUniforms
}): JSX.Element {
  const { files, layout, frames, shared } = props
  const drawn = useMemo(() => {
    const signs = signsOf(files, layout.blocks, layout.place, frames)
    const names = namesTexture(signs.names)
    return {
      geometry: panels(signs, layout.blocks.kind),
      names,
      material: signMaterial(shared, names),
    }
  }, [files, layout, frames, shared])
  useEffect(
    () => () => {
      drawn.geometry.dispose()
      drawn.names.dispose()
      drawn.material.dispose()
    },
    [drawn],
  )
  return (
    <mesh
      geometry={drawn.geometry}
      material={drawn.material}
      frustumCulled={false}
    />
  )
}
