import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type JSX } from 'react'
import {
  AdditiveBlending,
  Color,
  Object3D,
  ShaderMaterial,
  type InstancedMesh,
} from 'three'
import { cityLayout } from '../lib/city-layout.ts'
import { VISIBILITY_GLSL } from '../lib/series.ts'
import type { Region } from '../lib/treemap.ts'
import { Buildings } from './Buildings.tsx'
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

/**
 * The codebase as a night city: districts are directories, towers are files
 * dense with symbols, beacons mark code others call, arcs carry the calls.
 * Over a timeline, towers rise as their files grow. Under the health lens,
 * hotspots burn, unused files go dark and hard-to-change files weather.
 */
export function City({
  series,
  playhead,
  lens,
  onHover,
}: SceneProps): JSX.Element {
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
        layout={layout}
        playhead={playhead}
        lens={lens}
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
