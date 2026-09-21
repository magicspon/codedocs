import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type JSX } from 'react'
import {
  AdditiveBlending,
  Color,
  Object3D,
  ShaderMaterial,
  Vector3,
  type InstancedMesh,
} from 'three'
import { cityLayout } from '../lib/city-layout.ts'
import { approach, type Shot } from '../lib/flight.ts'
import { VISIBILITY_GLSL } from '../lib/series.ts'
import type { Region } from '../lib/treemap.ts'
import { Alarms } from './Alarms.tsx'
import { Buildings } from './Buildings.tsx'
import { useFlight } from './fly.ts'
import { useFocus } from './focus.ts'
import type { SceneProps } from './scene.ts'
import { heightAt, LIFT } from './stack.ts'
import { TraceFlow } from './TraceFlow.tsx'
import { Weather } from './Weather.tsx'

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
    uniforms: {
      uTime: { value: 0 },
      uHistory: { value: 0 },
      uDim: { value: 1 },
    },
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
      uniform float uDim;
      varying float vProgress;
      varying float vPhase;
      varying vec3 vColor;
      varying float vLife;
      void main() {
        float head = fract(uTime * 0.25 + vPhase);
        float pulse = smoothstep(0.18, 0.0, abs(vProgress - head));
        // Dim enough to read as traffic over the city rather than as a net
        // drawn across it: the towers and their windows carry the picture.
        gl_FragColor = vec4(vColor * (0.015 + pulse * 0.55) * vLife * uDim, 1.0);
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
 * dense with symbols, their windows lit by the traffic through them, masts
 * mark code others call, arcs carry the calls. Over a timeline, towers rise as
 * their files grow. Under the health lens, hotspots raise alarm pillars,
 * unreachable files stand abandoned, hard-to-change files weather, and the air
 * itself thickens with the repository's debt. Under a search, the rest of the
 * city goes dark and light arcs between the traced towers. Pick one file and
 * the camera flies up over the rooftops and down to its tower, and a band of
 * light climbs the tower, switching on every floor.
 */
export function City({
  series,
  playhead,
  lens,
  onHover,
  trace,
  onPick,
}: SceneProps): JSX.Element {
  const layout = useMemo(() => cityLayout(series), [series])
  const traffic = useMemo(trafficMaterial, [])
  const focus = useFocus(trace, series.merged.files.length)
  // Arcs leave from the roofs, at each tower's tallest, and bow like the traffic.
  const shape = useMemo(
    () => ({
      anchors: layout.buildings.map((b) => [b.x, LIFT + b.h, b.z] as const),
      bow: 0.3,
      size: layout.unit * 0.55,
      lives: series.fileLife,
    }),
    [layout, series],
  )
  const pick = trace?.roots.length === 1 ? trace.roots[0]! : null
  useFlight(
    pick,
    (file: number, from: Shot) => {
      const b = layout.buildings[file]!
      const h = heightAt(b, playhead.t)
      const middle = new Vector3(b.x, LIFT + h * 0.5, b.z)
      // Far enough back for the whole tower, near enough that it fills the view.
      const distance = Math.max(
        h * 1.5,
        Math.max(b.w, b.d) * 4,
        layout.unit * 5,
      )
      return approach(from, middle, distance, 0.42)
    },
    // A drone's path: up over the rooftops, then down on to the tower.
    0.35,
  )
  useFrame((state) => {
    traffic.uniforms.uTime!.value = state.clock.elapsedTime
    traffic.uniforms.uHistory!.value = playhead.t
    // The trace's own arcs carry the calls under a search.
    traffic.uniforms.uDim!.value = 1 - focus.mix.current * 0.9
  })
  const { size } = layout

  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={[size * 0.75, size * 0.55, size * 0.75]}
        fov={45}
        far={size * 6}
      />
      <Weather smog={layout.smog} size={size} playhead={playhead} lens={lens} />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01}>
        <planeGeometry args={[size * 4, size * 4]} />
        <meshStandardMaterial color="#04050a" />
      </mesh>
      <Districts districts={layout.districts} unit={layout.unit} />
      <Buildings
        layout={layout}
        playhead={playhead}
        lens={lens}
        focus={focus}
        pick={pick}
        onHover={onHover}
        onPick={onPick}
      />
      <Alarms layout={layout} playhead={playhead} lens={lens} />
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
      <TraceFlow
        trace={trace}
        shape={shape}
        files={series.merged.files}
        playhead={playhead}
        focus={focus.mix}
        scale={300}
      />
      <OrbitControls
        makeDefault
        enableDamping
        maxPolarAngle={Math.PI / 2.1}
        maxDistance={size * 2}
      />
    </>
  )
}
