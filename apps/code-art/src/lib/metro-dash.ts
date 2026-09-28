import { Vector3 } from 'three'
import type { Stick } from './craft.ts'
import type { MetroLayout } from './metro-layout.ts'

/**
 * What passes between the metro scene and its overlay, written and read on
 * each side's own clock. Kept out of React state: a speed changing sixty
 * times a second would re-render the whole page as often. The scene writes
 * the buggy's state; the overlay writes the switches.
 */
export const dash = {
  /** World units (about metres) per second, forwards; negative in reverse. */
  speed: 0,
  /** Where the buggy is and which way it faces, for the minimap. */
  position: new Vector3(),
  forward: new Vector3(0, 0, -1),
  /** The layout being driven, for the minimap; `null` when no metro is up. */
  layout: null as MetroLayout | null,
  /** Whether the autopilot is driving. */
  autopilot: false,
}

/** Whether a stick asks for anything at all. */
export function pressed(stick: Stick): boolean {
  return stick.thrust !== 0 || stick.turn !== 0 || stick.boost
}
