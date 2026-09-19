import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type JSX } from 'react'
import {
  AdditiveBlending,
  Color,
  Object3D,
  ShaderMaterial,
  type InstancedMesh,
} from 'three'
import { cityLayout, type Building } from '../lib/city-layout.ts'
import { VISIBILITY_GLSL, type Playhead } from '../lib/series.ts'
import type { Region } from '../lib/treemap.ts'
import type { SceneProps } from './scene.ts'

const dummy = new Object3D()

/** Fills an instanced mesh with one box per item. */
function useBoxes(
  mesh: React.RefObject<InstancedMesh | null>,
  items: readonly {
    x: number
    y: number
    z: number
    w: number
    h: number
    d: number
    color: Color
  }[],
): void {
  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    items.forEach((item, i) => {
      dummy.position.set(item.x, item.y, item.z)
      dummy.scale.set(item.w, item.h, item.d)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      m.setColorAt(i, item.color)
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.computeBoundingSphere()
  }, [mesh, items])
}

/** Light pulses travelling along each arc, so the heaviest call routes read as traffic. */
function trafficMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexColors: true,
    uniforms: { uTime: { value: 0 }, uHistory: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float progress;
      attribute float phase;
      attribute float birth;
      attribute float death;
      uniform float uHistory;
      varying float vLife;
      ${VISIBILITY_GLSL}
      varying float vProgress;
      varying float vPhase;
      varying vec3 vColor;
      void main() {
        vProgress = progress;
        vPhase = phase;
        vColor = color;
        vLife = visibility(birth, death, uHistory);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying float vProgress;
      varying float vPhase;
      varying vec3 vColor;
      varying float vLife;
      void main() {
        float head = fract(uTime * 0.25 + vPhase);
        float pulse = smoothstep(0.18, 0.0, abs(vProgress - head));
        gl_FragColor = vec4(vColor * (0.02 + pulse * 0.9) * vLife, 1.0);
      }
    `,
  })
}

function Districts({
  districts,
  unit,
}: {
  districts: readonly Region[]
  unit: number
}): JSX.Element {
  const mesh = useRef<InstancedMesh>(null)
  const items = useMemo(
    () =>
      districts.map((r) => ({
        x: r.x + r.w / 2,
        y: r.depth * unit * 0.04,
        z: r.y + r.h / 2,
        w: r.w,
        h: unit * 0.04,
        d: r.h,
        color: new Color().setHSL(
          0.62,
          0.25,
          0.05 + Math.min(r.depth, 8) * 0.018,
        ),
      })),
    [districts, unit],
  )
  useBoxes(mesh, items)
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, items.length]}
      receiveShadow
    >
      <boxGeometry />
      <meshStandardMaterial roughness={0.9} />
    </instancedMesh>
  )
}

/** A building's height at fractional frame `t`, blending the two frames around it. */
function heightAt(b: Building, t: number): number {
  const f0 = Math.floor(t)
  const f1 = Math.min(f0 + 1, b.heights.length - 1)
  const h0 = b.heights[f0] ?? 0
  return h0 + ((b.heights[f1] ?? 0) - h0) * (t - f0)
}

/**
 * Towers and their beacons, re-stacked whenever the playhead moves. On the CPU
 * rather than in a shader: a standard lit material keeps its lighting, and
 * 12,000 matrices is well inside one frame.
 */
function Buildings(props: {
  buildings: readonly Building[]
  playhead: Playhead
  onHover: SceneProps['onHover']
}): JSX.Element {
  const { buildings, playhead } = props
  const body = useRef<InstancedMesh>(null)
  const roof = useRef<InstancedMesh>(null)
  const drawn = useRef(Number.NaN)
  const lift = 0.3
  const lit = useMemo(
    () => buildings.flatMap((b, i) => (b.beacon > 0 ? [i] : [])),
    [buildings],
  )

  useLayoutEffect(() => {
    // Colours never change; only matrices follow the playhead.
    buildings.forEach((b, i) => body.current?.setColorAt(i, b.color))
    lit.forEach((i, k) =>
      roof.current?.setColorAt(
        k,
        new Color('#ffb46b').multiplyScalar(
          0.6 + buildings[i]!.beacon ** 2 * 4,
        ),
      ),
    )
    drawn.current = Number.NaN
  }, [buildings, lit])

  useFrame(() => {
    if (playhead.t === drawn.current || !body.current || !roof.current) return
    drawn.current = playhead.t
    buildings.forEach((b, i) => {
      const h = heightAt(b, playhead.t)
      dummy.position.set(b.x, lift + h / 2, b.z)
      // A zero scale would make a singular matrix; a sliver is invisible anyway.
      dummy.scale.set(h > 0 ? b.w : 1e-4, Math.max(h, 1e-4), h > 0 ? b.d : 1e-4)
      dummy.updateMatrix()
      body.current!.setMatrixAt(i, dummy.matrix)
    })
    lit.forEach((i, k) => {
      const b = buildings[i]!
      const h = heightAt(b, playhead.t)
      const on = h > 0 ? 1 : 1e-4
      dummy.position.set(b.x, lift + h + 0.02, b.z)
      dummy.scale.set(b.w * 0.6 * on, 0.04 * on, b.d * 0.6 * on)
      dummy.updateMatrix()
      roof.current!.setMatrixAt(k, dummy.matrix)
    })
    body.current.instanceMatrix.needsUpdate = true
    roof.current.instanceMatrix.needsUpdate = true
    body.current.computeBoundingSphere()
    roof.current.computeBoundingSphere()
  })

  return (
    <>
      <instancedMesh
        ref={body}
        args={[undefined, undefined, buildings.length]}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => (
          e.stopPropagation(),
          props.onHover(e.instanceId ?? null)
        )}
        onPointerOut={() => props.onHover(null)}
      >
        <boxGeometry />
        <meshStandardMaterial roughness={0.55} metalness={0.25} />
      </instancedMesh>
      <instancedMesh ref={roof} args={[undefined, undefined, lit.length]}>
        <boxGeometry />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </>
  )
}

/**
 * The codebase as a night city: districts are directories, towers are files
 * dense with symbols, beacons mark code others call, arcs carry the calls.
 * Over a timeline, towers rise as their files grow.
 */
export function City({ series, playhead, onHover }: SceneProps): JSX.Element {
  const layout = useMemo(() => cityLayout(series), [series])
  const traffic = useMemo(trafficMaterial, [])
  useFrame((state) => {
    traffic.uniforms.uTime!.value = state.clock.elapsedTime
    traffic.uniforms.uHistory!.value = playhead.t
  })
  const { size } = layout

  return (
    <>
      <color attach="background" args={['#05060d']} />
      <fog attach="fog" args={['#05060d', size * 0.4, size * 1.8]} />
      <PerspectiveCamera
        makeDefault
        position={[size * 0.75, size * 0.55, size * 0.75]}
        fov={45}
        far={size * 6}
      />
      <hemisphereLight args={['#6f7fb8', '#0a0a12', 0.5]} />
      <directionalLight
        position={[size * 0.4, size, size * 0.2]}
        intensity={1.4}
        color="#b8c6ff"
      />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01}>
        <planeGeometry args={[size * 4, size * 4]} />
        <meshStandardMaterial color="#04050a" />
      </mesh>
      <Districts districts={layout.districts} unit={layout.unit} />
      <Buildings
        buildings={layout.buildings}
        playhead={playhead}
        onHover={onHover}
      />
      <lineSegments material={traffic}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[layout.traffic.positions, 3]}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[layout.traffic.colors, 3]}
          />
          <bufferAttribute
            attach="attributes-progress"
            args={[layout.traffic.progress, 1]}
          />
          <bufferAttribute
            attach="attributes-phase"
            args={[layout.traffic.phase, 1]}
          />
          <bufferAttribute
            attach="attributes-birth"
            args={[layout.traffic.births, 1]}
          />
          <bufferAttribute
            attach="attributes-death"
            args={[layout.traffic.deaths, 1]}
          />
        </bufferGeometry>
      </lineSegments>
      <OrbitControls
        makeDefault
        enableDamping
        maxPolarAngle={Math.PI / 2.1}
        maxDistance={size * 2}
      />
    </>
  )
}
