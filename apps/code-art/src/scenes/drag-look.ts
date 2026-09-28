import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, type RefObject } from 'react'

/** How far a drag can turn the head, in radians. */
const MAX_YAW = 2.4
const MAX_PITCH = 0.9
/** Radians per pixel dragged. */
const PER_PIXEL = 0.005

/** Where the driver is looking, relative to straight ahead. */
export interface Look {
  yaw: number
  pitch: number
}

/**
 * Dragging on the canvas turns the driver's head, as if pulling the view
 * round by hand; letting go eases it back to straight ahead. Read every frame, so it is a ref, not state.
 */
export function useDragLook(): RefObject<Look> {
  const look = useRef<Look>({ yaw: 0, pitch: 0 })
  const held = useRef(false)
  const canvas = useThree((s) => s.gl.domElement)
  useEffect(() => {
    let last: { x: number; y: number } | null = null
    const down = (e: PointerEvent): void => {
      last = { x: e.clientX, y: e.clientY }
      held.current = true
      canvas.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent): void => {
      if (!last) return
      const l = look.current
      l.yaw = Math.max(
        -MAX_YAW,
        Math.min(MAX_YAW, l.yaw + (e.clientX - last.x) * PER_PIXEL),
      )
      l.pitch = Math.max(
        -MAX_PITCH,
        Math.min(MAX_PITCH, l.pitch + (e.clientY - last.y) * PER_PIXEL),
      )
      last = { x: e.clientX, y: e.clientY }
    }
    const up = (): void => {
      last = null
      held.current = false
    }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    return () => {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
    }
  }, [canvas])
  useFrame((_, dt) => {
    if (held.current) return
    const ease = Math.exp(-dt * 3)
    look.current.yaw *= ease
    look.current.pitch *= ease
  })
  return look
}
