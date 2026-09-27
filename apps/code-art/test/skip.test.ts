import { describe, expect, it } from 'vitest'
import { isSkipped } from '../scripts/skip.ts'

describe('isSkipped', () => {
  it('matches a folder by name at any depth', () => {
    expect(isSkipped('examples/app/index.ts', ['examples'])).toBe(true)
    expect(isSkipped('packages/llm/example/tutorial.ts', ['example'])).toBe(
      true,
    )
  })

  it('never matches the file name or part of a folder name', () => {
    expect(isSkipped('src/examples', ['examples'])).toBe(false)
    expect(isSkipped('src/examples-old/a.ts', ['examples'])).toBe(false)
    expect(isSkipped('src/a.ts', [])).toBe(false)
  })
})
