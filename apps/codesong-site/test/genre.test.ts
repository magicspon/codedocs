import { describe, expect, it } from 'vitest'
import { genreSearch } from '../src/GenrePicker.tsx'

describe('the genre in the URL', () => {
  it('names a genre the listener picked', () => {
    expect(genreSearch('dnb', 'techno')).toEqual({ genre: 'dnb' })
  })

  it('leaves the suggested genre out, so the plain link plays it', () => {
    expect(genreSearch('techno', 'techno')).toEqual({})
  })
})
