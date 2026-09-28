/**
 * Moving from one player to the next when the genre changes. Kept apart from
 * the player so it can be tested without Tone.js.
 */

import type { Section } from '@codedocs/codesong/browser'

/** Where the last player was when a new composition replaced it. */
export interface Handover {
  readonly beats: number
  /** The last composition's sections, to find the same place in the next. */
  readonly sections: readonly Section[]
  readonly playing: boolean
  readonly muted: ReadonlySet<string>
}

/** The parts of a player a handover uses. */
export interface Resumable {
  mute(track: string, muted: boolean): void
  seek(beats: number): void
  play(): Promise<void>
  readonly playing: boolean
}

/**
 * The beat in `to` at the same place as `beats` in `from`: the same section,
 * the same way through it. Genres stretch sections by different amounts, so
 * the same beat would land somewhere else.
 */
export function carry(
  beats: number,
  from: readonly Section[],
  to: readonly Section[],
): number {
  const i = from.findIndex((s) => beats < s.start + s.length)
  const was = from[i]
  const now = to[i]
  if (!was || !now) return beats
  return now.start + ((beats - was.start) / was.length) * now.length
}

/**
 * Puts `p` where the last player was: the same tracks muted, the same place
 * in `sections`, and playing if it was. Returns the muted set, which the
 * player's actions then own.
 */
export function takeOver(
  p: Resumable,
  from: Handover | null,
  sections: readonly Section[],
  onPlaying: (playing: boolean) => void,
): Set<string> {
  const off = new Set<string>(from?.muted)
  for (const track of off) p.mute(track, true)
  if (!from) return off
  p.seek(carry(from.beats, from.sections, sections))
  // Audio was already allowed by the click that started the last player.
  if (from.playing) void p.play().then(() => onPlaying(p.playing))
  return off
}
