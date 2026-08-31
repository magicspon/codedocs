/**
 * What the descriptor path separates, and what it admits it cannot.
 *
 * ADR 0002 names locals "by descriptor path rather than by ordinal". These are
 * the cases that decides: a segment taken from what the author wrote survives a
 * sibling being inserted above it, and where the author wrote no name there is
 * nothing to take — so the id is reported as a collision rather than merged.
 */

import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { analyse } from '../src/adapter/ts7.ts'
import type { SymbolNode } from '../src/model.ts'
import { callers } from '../src/operations/calls.ts'
import { openSession } from '../src/session.ts'

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'descriptors',
)
const result = analyse(fixtureRoot, ['tsconfig.json'])

const file = 'src/descriptors.ts'
const at = (qualified: string): SymbolNode | undefined =>
  result.symbols.find((symbol) => symbol.id === `${file}#${qualified}`)

/** Every declaration the sweep saw, so a collapse can be told from a drop. */
const claiming = (qualified: string): number =>
  result.symbols.filter((symbol) => symbol.id === `${file}#${qualified}`).length

describe('the descriptor path', () => {
  it('tells sibling callbacks apart by the name their call was given', () => {
    expect(
      at('describe("parsing").it("accepts a known field").schema'),
    ).toBeDefined()
    expect(
      at('describe("parsing").it("rejects an unknown field").schema'),
    ).toBeDefined()
    // The whole point: before this, both were `descriptors.ts#schema`.
    expect(at('schema')).toBeUndefined()
  })

  it('tells sibling arrow functions apart by their object-literal key', () => {
    expect(at('pageObject.queryDelete.field')).toBeDefined()
    expect(at('pageObject.queryToggle.field')).toBeDefined()
    expect(at('pageObject.field')).toBeUndefined()
  })

  it('gives a constructor a segment, so its locals leave the class alone', () => {
    // The one path by which this defect reached a durable id: a `const url` in
    // the constructor claimed `Calendar.url`, the property's own id.
    const property = at('Calendar.url')
    expect(property?.durable).toBe(true)
    expect(property?.collisions).toBe(0)
    expect(at('Calendar.constructor.url')?.durable).toBe(false)
  })

  it('leaves a durable id alone', () => {
    const top = at('retry')
    expect(top?.durable).toBe(true)
    expect(top?.collisions).toBe(0)
  })

  it('marks a separated local not durable, as it was before', () => {
    expect(at('pageObject.queryDelete.field')?.durable).toBe(false)
  })
})

describe('a collision the descriptor path cannot resolve', () => {
  it('reports two catch clauses claiming one id, rather than merging them', () => {
    const err = at('retry.err')
    expect(err).toBeDefined()
    expect(err?.collisions).toBe(2)
    // Still one row: the id is what collides, so reporting it is the fix, not
    // storing two rows under one primary key.
    expect(claiming('retry.err')).toBe(1)
  })

  it('reports a callback whose call carries no name to take', () => {
    expect(at('totals.rows.map().row')?.collisions).toBe(2)
  })
})

describe("ADR 0002's deliberate collapse", () => {
  it('collapses overloads into one node and calls it no collision', () => {
    const parse = at('parse')
    expect(parse).toBeDefined()
    expect(parse?.collisions).toBe(0)
    expect(claiming('parse')).toBe(1)
  })

  it('collapses a local type merged with a local const', () => {
    const merged = at('merge.Attendee')
    expect(merged).toBeDefined()
    // Two declarations, one declaration space, so one symbol — the case an
    // "every declaration is durable" test would have got wrong.
    expect(merged?.collisions).toBe(0)
  })
})

describe('an answer over a collided id', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'codedocs-descriptors-'))
    cpSync(fixtureRoot, root, { recursive: true })
    writeFileSync(
      join(root, 'package.json'),
      '{"name":"descriptors","private":true}\n',
    )
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('names the collision as a blind spot rather than presenting a union', () => {
    const session = openSession({ cwd: root, noUpdate: false })
    try {
      const envelope = callers(
        session.store,
        session.context,
        `${file}#retry.report`,
        null,
      )
      // Two catch clauses declare a `report`, and both are called. The edges are
      // the union, which is the over-report the blind spot exists to declare.
      expect(envelope.result).toHaveLength(2)
      expect(envelope.blindSpots.map((spot) => spot.subject)).toContain(
        `${file}#retry.report`,
      )
    } finally {
      session.close()
    }
  })

  it('leaves a subject that collides with nothing free of blind spots', () => {
    const session = openSession({ cwd: root, noUpdate: false })
    try {
      const envelope = callers(
        session.store,
        session.context,
        `${file}#retry`,
        null,
      )
      expect(envelope.blindSpots).toEqual([])
    } finally {
      session.close()
    }
  })
})
