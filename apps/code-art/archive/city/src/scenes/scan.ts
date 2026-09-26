import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { CityLayout } from '../lib/city-layout.ts'
import type { FacadeUniforms } from '../lib/facade-material.ts'
import { easeInOut } from '../lib/flight.ts'
import { FLIGHT_SECONDS } from './fly.ts'
import { LIFT } from './stack.ts'

/** How long the scan takes to climb a settlement, in seconds. */
const SCAN_SECONDS = 1.4

/**
 * Lights a picked settlement as the camera lands on it: a band of light
 * climbs from the street to its landmark's roof, switching on every building
 * it passes -- shortest first -- so the eye is led up the skyline the flight
 * arrived at. It starts as the camera slows for the landing rather than
 * after, so the two read as one move.
 */
export function useScan(
  uniforms: FacadeUniforms,
  layout: CityLayout,
  pick: number | null,
): void {
  const started = useRef(Number.NaN)
  // Stepped like the flight's clock, so the two stay in time on a slow frame.
  const clock = useRef(0)
  const last = useRef(pick)
  useEffect(() => {
    if (pick === null) return
    last.current = pick
    started.current = Number.NaN
  }, [pick])

  useFrame((_, delta) => {
    clock.current += Math.min(delta, 1 / 30)
    const on = pick === null ? 0 : 1
    const scan = uniforms.uScan
    scan.value += (on - scan.value) * Math.min(1, delta * 6)
    const file = last.current
    if (file === null) return
    const now = clock.current
    if (Number.isNaN(started.current))
      started.current = now + FLIGHT_SECONDS * 0.55
    const s = layout.settlements[file]!
    // A little margin at each end, so the band enters and leaves whole.
    const margin = layout.unit * 0.6
    const climb = easeInOut((now - started.current) / SCAN_SECONDS)
    uniforms.uScanY.value = LIFT - margin + (s.h + margin * 2) * climb
  })
}
