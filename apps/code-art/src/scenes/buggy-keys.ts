import { useHotkey } from '@tanstack/react-hotkeys'
import type { RefObject } from 'react'
import { Vector3 } from 'three'
import { park, type Buggy } from '../lib/buggy.ts'
import type { Pilot } from '../lib/metro-autopilot.ts'
import { dash } from '../lib/metro-dash.ts'
import { hopTo } from '../lib/metro-hop.ts'
import type { MetroLayout } from '../lib/metro-layout.ts'
import type { View } from './buggy-view.ts'

/**
 * The buggy's single-press keys: V swaps the camera's seat, R goes back to
 * the start, N hops to the next landmark (stopping on the road beside it,
 * facing it), P hands the wheel to the autopilot or takes it back. Holding
 * keys to drive is `useCraftKeys`'s job.
 */
export function useBuggyKeys(
  layout: MetroLayout,
  buggy: RefObject<Buggy | null>,
  view: RefObject<View>,
  pilot: RefObject<Pilot | null>,
  hops: RefObject<number>,
): void {
  const { radius, start } = layout
  const put = (at: readonly number[], facing: readonly number[]): void => {
    buggy.current = park(new Vector3(...at), new Vector3(...facing), radius)
    pilot.current = null
  }
  useHotkey(
    'V',
    () => void (view.current = view.current === 'driver' ? 'chase' : 'driver'),
  )
  useHotkey('R', () => put(start.at, start.facing))
  useHotkey('N', () => {
    const hop = hopTo(layout, hops.current++)
    if (hop) put(hop.at, hop.facing)
  })
  useHotkey('P', () => {
    dash.autopilot = !dash.autopilot
    pilot.current = null
  })
}
