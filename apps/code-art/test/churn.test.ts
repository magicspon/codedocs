import { describe, expect, it } from 'vitest'
import { notShallow, parseLog } from '../scripts/churn.ts'

describe('parseLog', () => {
  // Two commits as `git log --numstat --format=format:%at|%ae` prints them.
  const log = [
    '1000|ana@example.com',
    '3\t1\tsrc/a.ts',
    '-\t-\tlogo.png',
    '',
    '900|ben@example.com',
    '10\t0\tsrc/a.ts',
    '2\t2\tsrc/b.ts',
  ].join('\n')

  it('makes one event per file per commit, moved forward by the shift', () => {
    expect(parseLog(log, 50)).toEqual([
      {
        path: 'src/a.ts',
        timestamp: 1050,
        added: 3,
        deleted: 1,
        author: 'ana@example.com',
      },
      {
        path: 'logo.png',
        timestamp: 1050,
        added: 0,
        deleted: 0,
        author: 'ana@example.com',
      },
      {
        path: 'src/a.ts',
        timestamp: 950,
        added: 10,
        deleted: 0,
        author: 'ben@example.com',
      },
      {
        path: 'src/b.ts',
        timestamp: 950,
        added: 2,
        deleted: 2,
        author: 'ben@example.com',
      },
    ])
  })

  it('drops a path git still quotes, which fallow would reject', () => {
    const quoted = '5|x\n1\t0\t"odd\\tname.ts"\n2\t0\tsrc/ok.ts'
    expect(parseLog(quoted, 0).map((e) => e.path)).toEqual(['src/ok.ts'])
  })

  it('keeps a pipe inside a path', () => {
    expect(parseLog('5|x\n1\t0\tsrc/a|b.ts', 0)[0]?.path).toBe('src/a|b.ts')
  })
})

describe('notShallow', () => {
  it('excludes each boundary commit and ignores anything else', () => {
    const sha = 'a'.repeat(40)
    expect(notShallow(`${sha}\n\nnot-a-sha\n`)).toEqual([`^${sha}`])
    expect(notShallow('')).toEqual([])
  })
})
