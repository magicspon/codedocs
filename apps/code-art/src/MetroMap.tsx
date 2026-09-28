import { useEffect, useRef, type JSX } from 'react'
import { dash } from './lib/metro-dash.ts'
import { drawMap, mapFor, SIZE } from './metro-map-draw.ts'

/** Redraws a second; the map needs no more to feel live. */
const FPS = 20

/**
 * The minimap, bottom left above the speedometer, the way the buggy faces
 * pointing up. `ahead` is the file the driver faces, picked out on it.
 */
export function MetroMap(props: { ahead: number | null }): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const ahead = useRef(props.ahead)
  ahead.current = props.ahead
  useEffect(() => {
    const el = canvas.current
    const g = el?.getContext('2d')
    if (!el || !g) return
    const ratio = Math.min(2, window.devicePixelRatio || 1)
    el.width = SIZE * ratio
    el.height = SIZE * ratio
    g.scale(ratio, ratio)
    let frame = 0
    let last = 0
    const tick = (now: number): void => {
      frame = requestAnimationFrame(tick)
      if (now - last < 1000 / FPS || !dash.layout) return
      last = now
      drawMap(g, mapFor(dash.layout), ahead.current)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])
  return <canvas ref={canvas} className="metro-map" aria-hidden="true" />
}
