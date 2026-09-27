/**
 * CodeSong inside Ableton Live. Right-click a track, choose "Build CodeSong",
 * and the newest plan `pnpm compose` wrote is built into the open Set.
 *
 * The only file that touches Ableton's SDK. It adapts the SDK to `LiveHost`
 * and leaves every decision to `buildPlan`, which is tested without Live.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  DrumChain,
  DrumRack,
  initialize,
  Simpler,
  type ActivationContext,
  type ExtensionContext,
  type MidiTrack,
} from '@ableton-extensions/sdk'
import {
  buildPlan,
  type BuildReport,
  type LiveHost,
  type LiveTrackHost,
} from '../../src/live/apply.ts'
import { parsePlan, type DrumPad, type LivePlan } from '../../src/live/plan.ts'

type Context = ExtensionContext<'1.0.0'>
type Track = MidiTrack<'1.0.0'>

const COMMAND = 'codesong.build'

/**
 * The plan `pnpm compose` wrote most recently. It reads the storage directory
 * because that is one of the two places an extension may read; `pnpm live`
 * points it at `apps/codesong/out`.
 */
function latestPlan(dir: string): LivePlan {
  const newest = readdirSync(dir)
    .filter((f) => f.endsWith('.live.json'))
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
  if (newest === undefined) {
    throw new Error(
      `no *.live.json in ${dir}; run \`pnpm --filter @codedocs/codesong compose <repo>\` first`,
    )
  }
  return parsePlan(readFileSync(newest, 'utf8'))
}

/**
 * A Drum Rack with a Simpler per pad. The library sample is imported into the
 * project first: Live may read it, the extension may not.
 */
async function addDrumRack(
  context: Context,
  track: Track,
  pads: readonly DrumPad[],
): Promise<void> {
  const device = await track.insertDevice('Drum Rack', track.devices.length)
  const rack = context.getObjectFromHandle(device.handle, DrumRack)
  for (const pad of pads) {
    const chain = await rack.insertChain(rack.chains.length)
    context.getObjectFromHandle(chain.handle, DrumChain).receivingNote =
      pad.note
    if (pad.sample === undefined) continue
    const simpler = await chain.insertDevice('Simpler', 0)
    const sample = await context.resources.importIntoProject(pad.sample)
    await context
      .getObjectFromHandle(simpler.handle, Simpler)
      .replaceSample(sample)
  }
}

function trackHost(context: Context, track: Track): LiveTrackHost {
  return {
    addDevice: async (name) => {
      await track.insertDevice(name, track.devices.length)
    },
    addDrumRack: (pads) => addDrumRack(context, track, pads),
    addClip: async (clip) => {
      const made = await track.createMidiClip(clip.start, clip.length)
      made.name = clip.name
      made.color = clip.color
      made.notes = clip.notes.map((n) => ({ ...n }))
    },
  }
}

function liveHost(context: Context): LiveHost {
  const song = context.application.song
  return {
    setTempo: (bpm) => {
      song.tempo = bpm
    },
    addMarker: async (time, name) => {
      const cue = await song.createCuePoint(time)
      cue.name = name
    },
    addMidiTrack: async (name) => {
      const track = await song.createMidiTrack()
      track.name = name
      return trackHost(context, track)
    },
  }
}

/** Builds the newest plan, reporting to the terminal `pnpm live` runs in. */
async function build(context: Context): Promise<void> {
  try {
    const dir = context.environment.storageDirectory
    if (dir === undefined) throw new Error('Live gave no storage directory')
    const plan = latestPlan(dir)
    const report = (await context.ui.withinProgressDialog(
      `Building ${plan.name}…`,
      { progress: 0 },
      (update, signal) =>
        buildPlan(plan, liveHost(context), update, () => signal.aborted),
    )) as BuildReport
    console.log(
      `CodeSong: built ${plan.name} (${report.tracks} tracks, ${report.clips} clips)`,
    )
    for (const p of report.problems) console.warn(`  skipped ${p}`)
  } catch (error) {
    console.error(
      `CodeSong: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/** Called by Live when the extension loads. */
export const activate = (activation: ActivationContext): void => {
  const context = initialize(activation, '1.0.0')
  context.commands.registerCommand(COMMAND, () => void build(context))
  // Any track will do: the build adds its own tracks and leaves this one alone.
  for (const scope of ['MidiTrack', 'AudioTrack'] as const) {
    void context.ui.registerContextMenuAction(scope, 'Build CodeSong', COMMAND)
  }
}
