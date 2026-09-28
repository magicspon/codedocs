import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Atlas } from '@codedocs/code-art/atlas'
import { describe, expect, it } from 'vitest'
import { compose, DEFAULT_OPTIONS } from '../src/compose/compose.ts'
import { evidence } from '../src/evidence.ts'
import { analyse } from '../src/regions.ts'
import { readStructure } from '../src/structure.ts'

const path = join(import.meta.dirname, '../../code-art/src/data/codedocs.json')
const analysis = analyse(
  readStructure(JSON.parse(readFileSync(path, 'utf8')) as Atlas),
)
const piece = compose(analysis, DEFAULT_OPTIONS)
const found = evidence(analysis, piece)

describe('evidence', () => {
  it('records the fifths the key was read from', () => {
    expect((found.fifths * 7) % 12).toBe(piece.key)
  })

  it('measures every file a motif names, and nothing else', () => {
    const named = new Set(piece.motifs.flatMap((m) => m.source.files))
    expect(new Set(Object.keys(found.measures))).toEqual(named)
  })

  it('has the subsystem behind every section', () => {
    const paths = new Set(found.regions.map((r) => r.path))
    for (const section of piece.sections)
      expect(paths).toContain(section.source)
  })
})

describe('evidence with symbol names', () => {
  const names = {
    [piece.motifs[0]!.source.files[0]!]: {
      names: ['outer', 'inner', 'outer', 'other'],
      kinds: [0, 0, 0, 5],
      parents: [-1, 0, -1, -1],
    },
  }

  it('keeps each file’s top-level names once, in order', () => {
    const withNames = evidence(analysis, piece, names)
    const [file] = Object.keys(names)
    expect(withNames.symbols?.[file!]).toEqual(['outer', 'other'])
  })

  it('has no names when none were exported', () => {
    expect(found.symbols).toBeUndefined()
  })
})
