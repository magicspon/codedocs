import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compose, DEFAULT_OPTIONS } from '../src/compose/compose.ts'
import {
  buildPlan,
  type LiveHost,
  type LiveTrackHost,
} from '../src/live/apply.ts'
import { DEFAULT_PALETTE } from '../src/live/palette.ts'
import { livePlan, parsePlan, type LivePlan } from '../src/live/plan.ts'
import { drumFolders, findKit } from '../src/live/samples.ts'
import { analyse } from '../src/regions.ts'
import { realise } from '../src/render/realise.ts'
import { readStructure } from '../src/structure.ts'
import { atlas } from './fixture.ts'

const piece = compose(analyse(readStructure(atlas)), DEFAULT_OPTIONS)
const tracks = realise(piece)
const kit = { kick: '/k.aif', snare: '/s.wav' }
const plan = livePlan(piece, tracks, DEFAULT_PALETTE, kit)

describe('livePlan', () => {
  it('gives every realised note to exactly one clip, in the clip’s time', () => {
    plan.tracks.forEach((t, i) => {
      const placed = t.clips.flatMap((c) =>
        c.notes.map((n) => [n.pitch, c.start + n.startTime] as const),
      )
      expect(placed).toEqual(tracks[i]!.notes.map((n) => [n.pitch, n.start]))
      for (const c of t.clips) {
        for (const n of c.notes) {
          expect(n.startTime + n.duration).toBeLessThanOrEqual(c.length)
        }
      }
    })
  })

  it('lays clips on section boundaries and marks each section', () => {
    const starts = new Set(piece.sections.map((s) => s.start))
    for (const t of plan.tracks) {
      for (const c of t.clips) expect(starts.has(c.start)).toBe(true)
    }
    expect(plan.markers.map((m) => m.name)).toEqual(
      piece.sections.map((s) => s.name),
    )
  })

  it('takes each role’s sound from the palette and pads only the drums', () => {
    const drums = plan.tracks.find((t) => t.role === 'percussion')!
    expect(drums.instrument).toBe('Drum Rack')
    expect(drums.pads).toEqual([
      { voice: 'kick', note: 36, sample: '/k.aif' },
      { voice: 'snare', note: 38, sample: '/s.wav' },
      { voice: 'closed-hat', note: 42 },
      { voice: 'open-hat', note: 46 },
    ])
    const lead = plan.tracks.find((t) => t.role === 'lead')!
    expect(lead.instrument).toBe(DEFAULT_PALETTE.voices.lead.instrument)
    expect(lead.pads).toBeUndefined()
  })

  it('round-trips through JSON and refuses another version', () => {
    expect(parsePlan(JSON.stringify(plan))).toEqual(plan)
    expect(() => parsePlan(JSON.stringify({ ...plan, version: 0 }))).toThrow(
      /compose it again/,
    )
  })
})

describe('findKit', () => {
  /** A fake /Applications with one Live whose drums hold `files`. */
  function applications(files: Record<string, string[]>): string {
    const root = mkdtempSync(join(tmpdir(), 'codesong-'))
    const drums = join(
      root,
      'Ableton Live 12 Beta.app/Contents/App-Resources/Core Library/Samples/One Shots/Drums',
    )
    for (const [folder, names] of Object.entries(files)) {
      mkdirSync(join(drums, folder), { recursive: true })
      for (const n of names) writeFileSync(join(drums, folder, n), '')
    }
    mkdirSync(join(root, 'Not Live.app'))
    return root
  }

  it('prefers the named sample, then the first with the prefix, else nothing', () => {
    const root = applications({
      Kick: ['Kick 909 1.aif', 'Kick A.wav'],
      Snare: ['Snare Z.wav', 'Snare B.aif', 'Snare B.aif.asd'],
      Hihat: ['Hihat Open 909.aif'],
    })
    const found = findKit(DEFAULT_PALETTE, drumFolders(root))
    expect(Object.keys(found).sort()).toEqual(['kick', 'open-hat', 'snare'])
    expect(found.kick).toMatch(/Kick 909 1\.aif$/)
    expect(found.snare).toMatch(/Snare B\.aif$/)
  })

  it('finds nothing where Live is not installed', () => {
    expect(drumFolders('/no/such/place')).toEqual([])
  })
})

/** A Live Set that records what the build asked of it. */
function fakeLive(refuse: string[] = []) {
  const log: string[] = []
  const live: LiveHost = {
    setTempo: (bpm) => void log.push(`tempo ${bpm}`),
    addMarker: async (time, name) => void log.push(`marker ${name}@${time}`),
    addMidiTrack: async (name) => {
      log.push(`track ${name}`)
      const track: LiveTrackHost = {
        addDevice: async (device) => {
          if (refuse.includes(device)) throw new Error('not in this edition')
          log.push(`  device ${device}`)
        },
        addDrumRack: async (pads) => void log.push(`  drums ${pads.length}`),
        addClip: async (clip) => void log.push(`  clip ${clip.name}`),
      }
      return track
    },
  }
  return { live, log }
}

describe('buildPlan', () => {
  const small: LivePlan = {
    ...plan,
    markers: [{ time: 0, name: 'intro' }],
    tracks: [
      {
        name: 'Lead',
        role: 'lead',
        instrument: 'Drift',
        effects: ['Reverb'],
        clips: [
          { name: 'a', start: 0, length: 4, color: 0, notes: [] },
          { name: 'b', start: 4, length: 4, color: 0, notes: [] },
        ],
      },
      {
        name: 'Percussion',
        role: 'percussion',
        instrument: 'Drum Rack',
        effects: [],
        pads: [{ voice: 'kick', note: 36 }],
        clips: [],
      },
    ],
  }

  it('sets the tempo, marks sections, then builds each track in order', async () => {
    const { live, log } = fakeLive()
    const report = await buildPlan(small, live)
    expect(log).toEqual([
      `tempo ${plan.tempo}`,
      'marker intro@0',
      'track Lead',
      '  device Drift',
      '  device Reverb',
      '  clip a',
      '  clip b',
      'track Percussion',
      '  drums 1',
    ])
    expect(report).toEqual({ tracks: 2, clips: 2, problems: [] })
  })

  it('notes a device Live refuses and carries on', async () => {
    const { live, log } = fakeLive(['Drift'])
    const report = await buildPlan(small, live)
    expect(report.problems).toEqual(['Lead Drift: not in this edition'])
    expect(log).toContain('  clip b')
  })

  it('stops between tracks once cancelled', async () => {
    const { live } = fakeLive()
    const report = await buildPlan(small, live, undefined, () => true)
    expect(report.tracks).toBe(0)
  })
})
