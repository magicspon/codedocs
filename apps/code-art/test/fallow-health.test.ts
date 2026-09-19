import { describe, expect, it } from 'vitest'
import { withHealth, type FallowReport } from '../scripts/fallow-health.ts'
import { trimReport } from '../scripts/read-fallow.ts'
import { atlas } from './fixture.ts'

type Score = NonNullable<FallowReport['health']['file_scores']>[number]

const score = (path: string, over: Partial<Score> = {}): Score => ({
  path,
  maintainability_index: 80.123,
  complexity_density: 0.2,
  total_cyclomatic: 10,
  total_cognitive: 8,
  crap_max: 12,
  lines: 100,
  ...over,
})

/** A report over the fixture's files: `a/hub.ts` is hot, the `b` files are copies. */
function report(): FallowReport {
  return {
    version: '3.22.0',
    check: {
      unused_files: [{ path: 'c/three.ts' }],
      unused_exports: [{ path: 'a/hub.ts' }, { path: 'a/hub.ts' }],
      circular_dependencies: [{ files: ['a/hub.ts', 'a/leaf.ts'] }],
    },
    dupes: {
      clone_groups: [
        {
          line_count: 10,
          instances: [
            { file: 'b/one.ts', start_line: 1, end_line: 10 },
            { file: 'b/deep/two.ts', start_line: 5, end_line: 14 },
            { file: 'c/three.ts', start_line: 1, end_line: 10 },
          ],
        },
        {
          line_count: 200,
          instances: [
            { file: 'b/one.ts', start_line: 1, end_line: 200 },
            { file: 'b/deep/two.ts', start_line: 1, end_line: 200 },
          ],
        },
      ],
    },
    health: {
      file_scores: [
        score('a/hub.ts'),
        score('a/leaf.ts'),
        score('b/one.ts'),
        score('c/three.ts'),
      ],
      hotspots: [
        { path: 'a/hub.ts', score: 73.14, commits: 17, trend: 'accelerating' },
        { path: 'a/leaf.ts', score: 5, commits: 3, trend: 'cooling' },
      ],
    },
  }
}

describe('withHealth', () => {
  const files = withHealth(atlas(), report(), true).files

  it('leaves a file fallow did not score without a score, not a zero one', () => {
    expect(files[3]!.health).toBeDefined()
    expect(files[3]!.health).not.toHaveProperty('score')
    expect(files[0]!.health?.score?.maintainability).toBe(80.12)
  })

  it('reads hotspot, trend and cycles onto the file', () => {
    expect(files[0]!.health).toMatchObject({
      hotspot: 73.14,
      commits: 17,
      trend: 1,
      cyclic: true,
    })
    expect(files[1]!.health?.trend).toBe(-1)
    expect(files[2]!.health).toMatchObject({
      hotspot: 0,
      trend: 0,
      cyclic: false,
    })
  })

  it('caps duplicated lines at the file’s length when clone groups overlap', () => {
    expect(files[2]!.health?.duplicated).toBe(100)
    expect(files[4]!.health?.duplicated).toBe(10)
    // two.ts has no score to cap against, so it keeps the raw sum.
    expect(files[3]!.health?.duplicated).toBe(210)
  })

  it('reads dead code only when the repo has a fallow config', () => {
    expect(files[4]!.health?.unused).toBe(true)
    expect(files[0]!.health).toMatchObject({ unused: false, unusedExports: 2 })
    const guessed = withHealth(atlas(), report(), false)
    expect(guessed.fallow?.deadCode).toBe(false)
    expect(guessed.files[4]!.health).not.toHaveProperty('unused')
    expect(guessed.files[0]!.health).not.toHaveProperty('unusedExports')
  })

  it('chains each clone group in file order and sums shared lines per pair', () => {
    // one.ts is 2, two.ts is 3, three.ts is 4 in the fixture.
    expect(withHealth(atlas(), report(), true).clones).toEqual([
      [2, 3, 210],
      [3, 4, 10],
    ])
  })
})

describe('trimReport', () => {
  it('keeps only what withHealth reads, and reads the same', () => {
    const full = report()
    const noisy = {
      ...full,
      kind: 'combined',
      check: {
        ...full.check,
        unused_files: [{ path: 'c/three.ts', actions: [{ type: 'delete' }] }],
      },
    } as FallowReport
    const trimmed = trimReport(noisy)
    expect(trimmed).not.toHaveProperty('kind')
    expect(trimmed.check.unused_files).toEqual([{ path: 'c/three.ts' }])
    expect(withHealth(atlas(), trimmed, true)).toEqual(
      withHealth(atlas(), full, true),
    )
  })
})
