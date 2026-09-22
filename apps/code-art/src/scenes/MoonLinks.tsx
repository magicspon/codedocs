import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type JSX, type RefObject } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  ShaderMaterial,
  Vector3,
  type Group,
  type LineSegments,
} from 'three'
import type { MoonLink, Place } from '../lib/moon-links.ts'
import { LINK_COLORS } from '../lib/palette.ts'
import { bodyAt } from './place.ts'

/** A star's place in the galaxy, in the frame the planets' star sits in. */
export type StarOf = (
  path: string,
) => readonly [number, number, number] | undefined

/**
 * Light runs along each line from caller to callee, a few pulses at a time,
 * so which way a link points reads without arrowheads. `along` is `0` at the
 * caller's end and `1` at the callee's.
 */
function linkMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float along;
      attribute vec3 color;
      varying float vAlong;
      varying vec3 vColor;
      void main() {
        vAlong = along;
        vColor = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOpacity;
      varying float vAlong;
      varying vec3 vColor;
      void main() {
        // A pulse's head is where the phase wraps; its tail trails behind it.
        float phase = fract(vAlong * 3.0 - uTime * 0.35);
        float pulse = phase * phase * phase * phase * phase * phase;
        gl_FragColor = vec4(vColor * (0.22 + 1.1 * pulse) * uOpacity, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
}

/** Colours and `along` for every line; only the positions move each frame. */
function geometryOf(links: readonly MoonLink[]): BufferGeometry {
  const heaviest = Math.log1p(Math.max(1, ...links.map((l) => l.count)))
  const colors = new Float32Array(links.length * 6)
  const along = new Float32Array(links.length * 2)
  links.forEach((link, i) => {
    // A link made at many sites burns brighter than a one-off.
    const k = 0.45 + (0.55 * Math.log1p(link.count)) / heaviest
    const c = LINK_COLORS[link.via] ?? LINK_COLORS[1]!
    colors.set([c.r * k, c.g * k, c.b * k, c.r * k, c.g * k, c.b * k], i * 6)
    along.set([0, 1], i * 2)
  })
  const g = new BufferGeometry()
  g.setAttribute(
    'position',
    new BufferAttribute(new Float32Array(links.length * 6), 3),
  )
  g.setAttribute('color', new BufferAttribute(colors, 3))
  g.setAttribute('along', new BufferAttribute(along, 1))
  return g
}

const toLocal = new Matrix4()
const point = new Vector3()

/**
 * The lines off a focused body's moons, drawn in the galaxy's frame so they
 * can reach other files' stars. Each end is re-read every frame, as the moons
 * and planets it joins keep turning. Mount it after the system, so the rings
 * have turned for this frame before their bodies are read.
 */
export function MoonLinks(props: {
  links: readonly MoonLink[]
  /** The focused body, which the moons are drawn round. */
  anchor: RefObject<Group | null>
  /** The file's star, which the planets are drawn round. */
  system: RefObject<Group | null>
  starOf: StarOf
}): JSX.Element | null {
  const { links, anchor, system, starOf } = props
  const lines = useRef<LineSegments>(null)
  const material = useMemo(linkMaterial, [])
  const geometry = useMemo(() => geometryOf(links), [links])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])
  // Each new set of lines fades in rather than snapping on.
  useEffect(() => {
    material.uniforms.uOpacity!.value = 0
  }, [links, material])

  /** Writes where `place` is into `point`, in the lines' frame; `false` if it is nowhere. */
  const locate = (place: Place, time: number): boolean => {
    const frame =
      place.frame === 'moons' || place.frame === 'body' ? anchor : system
    if (place.frame === 'file') {
      const star = starOf(place.path)
      if (star) point.set(...star)
      return star !== undefined
    }
    if (!frame.current) return false
    if (place.frame === 'moons' || place.frame === 'planets')
      bodyAt(place.ring, place.planet, time, point)
    else point.set(0, 0, 0)
    point.applyMatrix4(frame.current.matrixWorld).applyMatrix4(toLocal)
    return true
  }

  useFrame(({ clock }, delta) => {
    const l = lines.current
    if (!l?.parent || !anchor.current) return
    const time = clock.elapsedTime
    // Fresh matrices: the rings turned earlier this frame.
    anchor.current.updateWorldMatrix(true, false)
    toLocal.copy(l.parent.matrixWorld).invert()
    const positions = geometry.getAttribute('position') as BufferAttribute
    links.forEach((link, i) => {
      // An end with nowhere to be folds onto the other, drawing nothing.
      const from = locate(link.from, time)
      positions.setXYZ(i * 2, point.x, point.y, point.z)
      const to = locate(link.to, time)
      positions.setXYZ(i * 2 + 1, point.x, point.y, point.z)
      if (!from) positions.copyAt(i * 2, positions, i * 2 + 1)
      if (!to) positions.copyAt(i * 2 + 1, positions, i * 2)
    })
    positions.needsUpdate = true
    material.uniforms.uTime!.value = time
    const u = material.uniforms.uOpacity!
    u.value = Math.min(1, u.value + delta * 1.5)
  })

  if (links.length === 0) return null
  return (
    <lineSegments
      ref={lines}
      geometry={geometry}
      material={material}
      // The far ends swing round every frame; no bounding sphere holds them.
      frustumCulled={false}
      raycast={() => null}
    />
  )
}
