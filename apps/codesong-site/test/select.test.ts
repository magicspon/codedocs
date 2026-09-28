import { realise, type Song } from '@codedocs/codesong/browser'
import { describe, expect, it } from 'vitest'
import { highlight, motifAt, pickNote } from '../src/inspect/select.ts'
import router from '../songs/router.song.json' with { type: 'json' }

const tracks = realise((router as unknown as Song).composition)
const lead = tracks.find((t) => t.role === 'lead')!
const first = { track: lead.id, index: 0 }
const second = { track: lead.id, index: lead.notes.length - 1 }

describe('picking and hovering notes', () => {
  it('finds the motif a note plays, and nothing off the end of a track', () => {
    expect(motifAt(tracks, first)).toBe(lead.notes[0]!.motif)
    expect(motifAt(tracks, { track: lead.id, index: 1e6 })).toBeUndefined()
    expect(motifAt(tracks, undefined)).toBeUndefined()
  })

  it('selects the picked note’s motif, remembering the note', () => {
    expect(pickNote(tracks, first)).toEqual({
      kind: 'motif',
      motif: lead.notes[0]!.motif,
      pick: first,
    })
    expect(pickNote(tracks, { track: 'nowhere', index: 0 })).toBeUndefined()
  })

  it('lights up the hovered note’s motif over the selected one', () => {
    const selection = pickNote(tracks, first)!
    expect(highlight(tracks, undefined, selection)).toEqual({
      motif: lead.notes[0]!.motif,
      picked: first,
      section: undefined,
    })
    expect(highlight(tracks, second, selection).motif).toBe(
      lead.notes.at(-1)!.motif,
    )
  })

  it('lights up a selected section and no note', () => {
    expect(highlight(tracks, undefined, { kind: 'section', index: 2 })).toEqual(
      {
        motif: undefined,
        picked: undefined,
        section: 2,
      },
    )
  })
})
