import { useFrame } from '@react-three/fiber'
import { useRef, type RefObject } from 'react'

/**
 * How far the health lens is switched on, from `0` to `1`, eased over about a
 * third of a second so the picture turns rather than jumps. Read it in
 * `useFrame`; the hook's own frame callback runs first because it is
 * registered first.
 */
export function useLens(on: boolean): RefObject<number> {
  const mix = useRef(on ? 1 : 0)
  useFrame((_, delta) => {
    const target = on ? 1 : 0
    const next = mix.current + (target - mix.current) * Math.min(1, delta * 8)
    // Snap the tail so a settled lens stops asking for redraws.
    mix.current = Math.abs(target - next) < 0.002 ? target : next
  })
  return mix
}
