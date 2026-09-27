/**
 * Percussion from the graph's leaves: files that depend on nothing are the
 * small, frequent events, so they set how busy the hats are and where extra
 * kicks fall.
 */

import type { Motif, MotifNote } from '../model.ts'
import type { Structure } from '../structure.ts'

/** Indexes into `DRUM_VOICES`. */
const KICK = 0
const SNARE = 1
const HAT = 2
const OPEN_HAT = 3

/** Leaf files named as provenance; the rest are counted, not listed. */
const NAMED_LEAVES = 8

function hit(voice: number, start: number, velocity: number): MotifNote {
  return { degree: voice, start, duration: 0.25, velocity }
}

/** The most-used leaves, as the files the groove is read from. */
function leafFiles(structure: Structure): string[] {
  return structure.nodes
    .filter((n) => n.fanOut === 0)
    .sort((a, b) => b.fanIn - a.fanIn || a.path.localeCompare(b.path))
    .slice(0, NAMED_LEAVES)
    .map((n) => n.path)
}

/**
 * Two one-bar grooves: `groove` (kick and hats) and `groove-full` (with
 * backbeat snare and an open hat to close the bar).
 *
 * A dense graph plays sixteenth hats rather than eighths. `random` places the
 * extra kicks, as many as the leaf share allows, so a seed changes where they
 * fall but not how many there are.
 */
export function grooves(structure: Structure, random: () => number): Motif[] {
  const sixteenths = structure.meanFanOut >= 4
  const hatStep = sixteenths ? 0.25 : 0.5
  const hats: MotifNote[] = []
  for (let t = 0; t < 4; t += hatStep) {
    const onBeat = t % 1 === 0
    hats.push(hit(HAT, t, onBeat ? 84 : 56 + Math.floor(random() * 16)))
  }

  const offbeats = [0.75, 1.5, 2.5, 3.25, 3.5]
  const extra = Math.round(structure.leafShare * 3)
  const kicks = [hit(KICK, 0, 112), hit(KICK, 2, 104)]
  const pool = [...offbeats]
  for (let k = 0; k < extra && pool.length > 0; k++) {
    const [at] = pool.splice(Math.floor(random() * pool.length), 1)
    kicks.push(hit(KICK, at!, 88))
  }

  const source = {
    files: leafFiles(structure),
    structure: 'leaf-files' as const,
  }
  const byStart = (a: MotifNote, b: MotifNote): number =>
    a.start - b.start || a.degree - b.degree
  return [
    {
      id: 'groove',
      source,
      notes: [...kicks, ...hats].sort(byStart),
      length: 4,
    },
    {
      id: 'groove-full',
      source,
      notes: [
        ...kicks,
        ...hats.filter((h) => h.start !== 3.5),
        hit(SNARE, 1, 100),
        hit(SNARE, 3, 100),
        hit(OPEN_HAT, 3.5, 80),
      ].sort(byStart),
      length: 4,
    },
  ]
}
