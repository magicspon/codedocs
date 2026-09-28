/**
 * Moving from one player to the next when the genre changes. Kept apart from
 * the player so it can be tested without Tone.js.
 */

/** Where the last player was when a new composition replaced it. */
export interface Handover {
  readonly beats: number
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
 * Puts `p` where the last player was: the same tracks muted, the same beat,
 * and playing if it was. Returns the muted set, which the player's actions
 * then own.
 */
export function takeOver(
  p: Resumable,
  from: Handover | null,
  onPlaying: (playing: boolean) => void,
): Set<string> {
  const off = new Set<string>(from?.muted)
  for (const track of off) p.mute(track, true)
  if (!from) return off
  p.seek(from.beats)
  // Audio was already allowed by the click that started the last player.
  if (from.playing) void p.play().then(() => onPlaying(p.playing))
  return off
}
