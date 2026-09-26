import { useEffect, useRef, type JSX } from 'react'
import { drawSky, makeSky, type Sky } from './sky.ts'

/**
 * A full-screen animated night sky behind the landing page. With reduced
 * motion asked for it draws a single still frame and stops.
 */
export function Starfield(): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Eased toward the target, so the stars glide rather than jump.
    const pointer = { x: 0, y: 0 }
    const target = { x: 0, y: 0 }
    let sky: Sky
    let frame = 0
    let last = performance.now()

    const resize = (): void => {
      const dpr = Math.min(window.devicePixelRatio, 2)
      const { innerWidth: w, innerHeight: h } = window
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      sky = makeSky(w, h, dpr)
      if (still) drawSky(ctx, sky, 0, 0, pointer)
    }
    const move = (event: PointerEvent): void => {
      target.x = (event.clientX / window.innerWidth) * 2 - 1
      target.y = (event.clientY / window.innerHeight) * 2 - 1
    }
    const tick = (now: number): void => {
      // Capped, so a tab coming back from the background does not lurch.
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      pointer.x += (target.x - pointer.x) * Math.min(dt * 3, 1)
      pointer.y += (target.y - pointer.y) * Math.min(dt * 3, 1)
      drawSky(ctx, sky, now / 1000, dt, pointer)
      frame = requestAnimationFrame(tick)
    }

    resize()
    window.addEventListener('resize', resize)
    if (!still) {
      window.addEventListener('pointermove', move)
      frame = requestAnimationFrame(tick)
    }
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', move)
    }
  }, [])

  return <canvas ref={ref} className="sky" aria-hidden="true" />
}
