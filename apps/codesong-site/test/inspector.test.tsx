import { realise, type Song } from '@codedocs/codesong/browser'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Inspector, type Selection } from '../src/inspect/Inspector.tsx'
import router from '../songs/router.song.json' with { type: 'json' }

const score = router as unknown as Song
const { composition, evidence } = score
const tracks = realise(composition)

/** The panel's text for one selection, tags stripped. */
const panel = (selection: Selection): string =>
  renderToStaticMarkup(
    <Inspector
      score={score}
      tracks={tracks}
      selection={selection}
      onSelect={() => {}}
      onSeek={() => {}}
    />,
  ).replace(/<[^>]+>/g, ' ')

describe('the panel beside the score', () => {
  it('starts with the song, its key and every section', () => {
    const text = panel({ kind: 'song' })
    expect(text).toContain('Key:')
    for (const section of composition.sections)
      expect(text).toContain(section.name)
  })

  it('explains a section and offers the way back to the whole song', () => {
    const text = panel({ kind: 'section', index: 0 })
    expect(text).toContain('The whole song')
    expect(text).toContain(composition.sections[0]!.name)
  })

  it('names the file behind a picked lead note', () => {
    const t = tracks.findIndex((track) => track.role === 'lead')
    const lead = tracks[t]!
    const index = lead.notes.findIndex((note) =>
      composition.motifs
        .find((m) => m.id === note.motif)
        ?.source.files.some((f) => evidence.measures[f]),
    )
    const note = lead.notes[index]!
    const text = panel({
      kind: 'motif',
      motif: note.motif,
      pick: { track: lead.id, index },
    })
    expect(text).toContain('This note')
    expect(text).toMatch(/It stands for\s+\S+/)
    expect(text).toContain('Where it plays')
  })

  it('says so when a motif is not in the song', () => {
    expect(panel({ kind: 'motif', motif: 'nowhere' })).toContain(
      'There is no such motif.',
    )
  })
})
