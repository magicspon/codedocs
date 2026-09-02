/**
 * What `doctor` says about the label layer, and how a blind spot names a
 * specifier.
 *
 * Both are folds over rows, and both exist because ADR 0003 and ADR 0009 refuse
 * to report the same fact many times: one `(role, authorship)` pair is one line
 * however many files are under it, and one unresolved specifier is one blind
 * spot however many sites wrote it. A fold is worth asserting on rows built by
 * hand — a planted repository can only produce the shapes it happens to have.
 */

import { describe, expect, it } from 'vitest'

import { classification } from '../src/operations/classification.ts'
import { specifierSpots } from '../src/operations/scope.ts'
import type { Label, UnresolvedSpecifier } from '../src/model.ts'

/** One stored label row. */
const label = (
  node: string,
  axis: Label['axis'],
  value: Label['value'],
  derivation: Label['derivation'],
  provenance: Label['provenance'] = 'deterministic',
): Label => ({ node, axis, value, provenance, derivation })

/** The two rows the pass always stores for a file it reached. */
const classified = (
  node: string,
  role: Label['value'],
  authorship: Label['value'],
  derivation: Label['derivation'] = 'path-convention',
): Label[] => [
  label(node, 'role', role, derivation, 'inferred'),
  label(node, 'authorship', authorship, 'git-untracked'),
]

describe('the classification report', () => {
  it('counts one row per pair, with the signals behind it', () => {
    const found = classification([
      ...classified('src/a.ts', 'source', 'authored'),
      ...classified('src/b.ts', 'source', 'authored'),
      ...classified('test/c.ts', 'test', 'authored'),
    ])

    expect(found.counts).toEqual([
      {
        role: 'source',
        authorship: 'authored',
        files: 2,
        derivations: ['git-untracked', 'path-convention'],
      },
      {
        role: 'test',
        authorship: 'authored',
        files: 1,
        derivations: ['git-untracked', 'path-convention'],
      },
    ])
  })

  it('names the files classified by a convention rather than by evidence', () => {
    const found = classification([
      ...classified('src/a.ts', 'source', 'authored'),
      label('src/b.ts', 'role', 'source', 'default', 'inferred'),
      label('src/b.ts', 'authorship', 'authored', 'default', 'inferred'),
    ])

    // `default` is not a guess codedocs made: it is what fires when nothing did.
    expect(found.inferred).toEqual(['src/a.ts'])
  })

  it('reports an axis where two real signals disagreed, and no other', () => {
    const found = classification([
      label('src/a.ts', 'authorship', 'authored', 'path-convention'),
      label('src/a.ts', 'authorship', 'generated', 'generated-header'),
      label('src/a.ts', 'role', 'source', 'path-convention'),
      // One real signal and the default is not a contradiction.
      label('src/b.ts', 'role', 'test', 'path-convention'),
      label('src/b.ts', 'role', 'source', 'default'),
    ])

    expect(found.disagreements).toEqual([
      {
        file: 'src/a.ts',
        axis: 'authorship',
        values: [
          { value: 'authored', derivation: 'path-convention' },
          { value: 'generated', derivation: 'generated-header' },
        ],
      },
    ])
  })

  it('orders disagreements by file, then by axis', () => {
    const two = (node: string): Label[] => [
      label(node, 'role', 'source', 'path-convention'),
      label(node, 'role', 'test', 'user-config'),
      label(node, 'authorship', 'authored', 'path-convention'),
      label(node, 'authorship', 'generated', 'generated-header'),
    ]
    const found = classification([...two('src/b.ts'), ...two('src/a.ts')])

    expect(found.disagreements.map((one) => `${one.file} ${one.axis}`)).toEqual(
      [
        'src/a.ts authorship',
        'src/a.ts role',
        'src/b.ts authorship',
        'src/b.ts role',
      ],
    )
  })

  it('says nothing at all about a repository with no labels in it', () => {
    expect(classification([])).toEqual({
      counts: [],
      inferred: [],
      disagreements: [],
    })
  })
})

describe('a specifier as a blind spot', () => {
  const site = (
    specifier: string,
    cause: UnresolvedSpecifier['cause'],
    file = 'src/a.ts',
  ): UnresolvedSpecifier => ({ file, specifier, line: 1, cause })

  it('is one fact with a count, however many sites wrote it', () => {
    // 306 of cal.com `apps/web`'s 576 are one specifier; 306 lines would be
    // unreadable and would say nothing 1 line does not.
    const spots = specifierSpots([
      site('@scope/pkg/enums', 'missing-generated'),
      site('@scope/pkg/enums', 'missing-generated', 'src/b.ts'),
      site('@scope/pkg/enums', 'missing-generated', 'src/c.ts'),
    ])
    expect(spots).toHaveLength(1)
    expect(spots[0]?.subject).toBe('@scope/pkg/enums')
    expect(spots[0]?.reason).toContain('3 site(s)')
  })

  it('keeps one specifier’s two causes apart, and orders both by cause', () => {
    const spots = specifierSpots([
      site('same', 'unmapped'),
      site('same', 'broken'),
      site('earlier', 'broken'),
    ])
    expect(spots.map((spot) => spot.subject)).toEqual([
      'earlier',
      'same',
      'same',
    ])
    expect(spots[1]?.reason).toContain('imported but declared nowhere')
    expect(spots[2]?.reason).toContain('a resolver codedocs does not run')
  })

  it('says what each cause means, and never which command would clear it', () => {
    // ADR 0001 forbids a remediation for `broken`, and ADR 0009 extends that to
    // `unmapped`: naming a framework needs a lookup codedocs does not ship.
    const reasons = specifierSpots([
      site('a', 'unprepared'),
      site('b', 'missing-generated'),
      site('c', 'unmapped'),
      site('d', 'broken'),
    ]).map((spot) => spot.reason)

    expect(reasons[0]).toContain('install them')
    expect(reasons[1]).toContain('codegen')
    expect(reasons[2]).not.toContain('run ')
    expect(reasons[3]).not.toContain('run ')
  })

  it('has nothing to say where every specifier resolved', () => {
    expect(specifierSpots([])).toEqual([])
  })
})
