/**
 * Builds a plan into a Live Set through `LiveHost`, the few operations the
 * build needs. The extension adapts Ableton's SDK to it; tests pass a fake.
 * Keeping the SDK behind this seam is what lets the build be tested without
 * Live, and keeps the SDK, which may not be committed, out of this package.
 */

import type { DrumPad, LiveClip, LivePlan } from './plan.ts'

/** One track the build is filling. */
export interface LiveTrackHost {
  /** Appends a built-in device to the end of the chain. */
  addDevice(name: string): Promise<void>
  /** Appends a Drum Rack with one pad per entry. */
  addDrumRack(pads: readonly DrumPad[]): Promise<void>
  addClip(clip: LiveClip): Promise<void>
}

/** The open Live Set. */
export interface LiveHost {
  setTempo(bpm: number): void
  addMarker(time: number, name: string): Promise<void>
  /** Appends a MIDI track. */
  addMidiTrack(name: string): Promise<LiveTrackHost>
}

/** Reports how far the build has got, 0–100. */
export type Progress = (text: string, percent: number) => Promise<void>

/** What went wrong without stopping the build. */
export interface BuildReport {
  readonly tracks: number
  readonly clips: number
  /** One line per device or clip Live refused. */
  readonly problems: readonly string[]
}

const reason = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
 * Builds `plan` into the open Set: tempo, markers, then one track at a time.
 *
 * A device Live refuses, such as a Suite-only instrument on Live Standard, is
 * noted and skipped, so one missing synth does not cost the whole piece.
 * `cancelled` is checked between tracks.
 */
export async function buildPlan(
  plan: LivePlan,
  live: LiveHost,
  progress: Progress = async () => {},
  cancelled: () => boolean = () => false,
): Promise<BuildReport> {
  const problems: string[] = []
  const attempt = async (what: string, run: () => Promise<void>) => {
    try {
      await run()
      return true
    } catch (error) {
      problems.push(`${what}: ${reason(error)}`)
      return false
    }
  }

  live.setTempo(plan.tempo)
  for (const m of plan.markers) {
    await attempt(`marker ${m.name}`, () => live.addMarker(m.time, m.name))
  }

  let tracks = 0
  let clips = 0
  for (const [i, t] of plan.tracks.entries()) {
    if (cancelled()) break
    await progress(
      `${t.name}: ${t.instrument}`,
      Math.round((i / plan.tracks.length) * 100),
    )
    const track = await live.addMidiTrack(t.name)
    tracks++
    await attempt(`${t.name} ${t.instrument}`, () =>
      t.pads ? track.addDrumRack(t.pads) : track.addDevice(t.instrument),
    )
    for (const effect of t.effects) {
      await attempt(`${t.name} ${effect}`, () => track.addDevice(effect))
    }
    for (const clip of t.clips) {
      if (await attempt(`${t.name} ${clip.name}`, () => track.addClip(clip)))
        clips++
    }
  }
  await progress('Done', 100)
  return { tracks, clips, problems }
}
