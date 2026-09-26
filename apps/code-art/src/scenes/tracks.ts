import { useSyncExternalStore } from 'react'

/**
 * Whether planets' orbit lines are drawn. Held outside React state because
 * every orbit, in every scene, reads it from deep inside the canvas; passing
 * it down would thread one flag through each level of each system.
 */
let shown = true
const listeners = new Set<() => void>()

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** Shows the orbit lines if hidden, or hides them if shown. */
export function toggleTracks(): void {
  shown = !shown
  listeners.forEach((listener) => listener())
}

/** Whether orbit lines are drawn, re-rendering when that changes. */
export function useTracks(): boolean {
  return useSyncExternalStore(subscribe, () => shown)
}
