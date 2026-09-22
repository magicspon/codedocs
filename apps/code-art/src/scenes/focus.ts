import { useEffect, useMemo, useRef, type RefObject } from 'react'
import type { DataTexture } from 'three'
import { focusTexture } from '../lib/focus-texture.ts'
import type { Trace } from '../lib/trace.ts'
import { useLens } from './lens.ts'

/** A search's focus, ready for a scene's shaders. */
export interface Focus {
  /** Every file's focus, looked up by file index. */
  readonly texture: DataTexture
  /** How far the dimming has eased in, `0` to `1`; read it in `useFrame`. */
  readonly mix: RefObject<number>
}

/**
 * The focus a trace puts on a scene. A cleared search keeps the last trace's
 * texture while the mix eases out, so the scene brightens smoothly around
 * what was highlighted rather than flashing back.
 */
export function useFocus(trace: Trace | null, files: number): Focus {
  // The easing is the lens's: the same third-of-a-second turn.
  const mix = useLens(trace !== null)
  const last = useRef(trace)
  if (trace) last.current = trace
  const kept = last.current
  const texture = useMemo(() => focusTexture(files, kept?.focus), [kept, files])
  useEffect(() => () => texture.dispose(), [texture])
  return { texture, mix }
}
