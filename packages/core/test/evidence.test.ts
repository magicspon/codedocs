/**
 * `evidence`: every kind of fact about one subject, in one answer.
 *
 * Three things are worth pinning, and they are the three ADR 0006 and ADR 0012
 * argue over. The budget is **per kind**, so a symbol with many callers still
 * answers with its file and its labels. Each kind arrives in the order its own
 * operation would have given it, so two answers about one subject cannot
 * disagree. And `--claims` restates the payload rather than adding to it.
 */

import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { BatchEntry } from '../src/envelope.ts'
import { callers } from '../src/operations/calls.ts'
import {
  evidence,
  type EvidenceAnswer,
  type EvidenceEnvelope,
} from '../src/operations/evidence.ts'
import { UNSCOPED } from '../src/labels/index.ts'
import { openSession } from '../src/session/index.ts'
import { shorthandOf } from '../src/symbol-id.ts'

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'evidence',
)

/** A copy of the fixture, prepared or not, which is what decides its fidelity. */
function plant(prepared: boolean): string {
  const root = mkdtempSync(join(tmpdir(), 'codedocs-evidence-'))
  cpSync(fixture, root, { recursive: true })
  writeFileSync(
    join(root, 'package.json'),
    '{"name":"fixture","private":true}\n',
  )
  // Signal 1: an absent install is what lowers a project to `syntactic`, so the
  // two roots differ in exactly one thing.
  if (prepared) mkdirSync(join(root, 'node_modules'), { recursive: true })
  return root
}

let root: string
let unprepared: string

beforeAll(() => {
  root = plant(true)
  unprepared = plant(false)
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(unprepared, { recursive: true, force: true })
})

/** Run `evidence` over a real session, as the binding does. */
function ask(
  subject: string,
  limit: number | null = null,
  options: { claims?: boolean; cwd?: string } = {},
): EvidenceEnvelope {
  const session = openSession({
    cwd: options.cwd ?? root,
    noUpdate: false,
  })
  try {
    return evidence(session.store, session.context, [subject], limit, {
      scoping: UNSCOPED,
      claims: options.claims === true,
    })
  } finally {
    session.close()
  }
}

/** `ask`'s batched twin, for asserting ADR 0014's per-subject accounting. */
function askMany(
  subjects: readonly string[],
  limit: number | null = null,
): EvidenceEnvelope {
  const session = openSession({ cwd: root, noUpdate: false })
  try {
    return evidence(session.store, session.context, subjects, limit, {
      scoping: UNSCOPED,
      claims: false,
    })
  } finally {
    session.close()
  }
}

/** The one entry a single-subject `ask` produces, which every test here expects. */
const entry = (envelope: EvidenceEnvelope): BatchEntry<EvidenceAnswer> => {
  const found = envelope.result?.[0]
  if (found === undefined) throw new Error('evidence answered with no result')
  return found
}

/** The one subject's assembled report. */
const report = (envelope: EvidenceEnvelope): EvidenceAnswer =>
  entry(envelope).result

describe('evidence', () => {
  it('assembles every kind the index holds about one subject', () => {
    const found = report(ask('charge'))

    expect(found.symbols.items.map((node) => shorthandOf(node.id))).toEqual([
      'src/payments.ts#charge',
    ])
    // The file arrives with the fidelity and canonical project `file` gives it,
    // rather than a second answer about the same file.
    expect(found.files.items).toHaveLength(1)
    expect(found.files.items[0]?.path).toBe('src/payments.ts')
    expect(found.files.items[0]?.fidelity).toBe('typed')

    expect(found.callers.items.map((edge) => shorthandOf(edge.from))).toEqual([
      'src/callers.ts#one',
      'src/callers.ts#three',
      'src/callers.ts#two',
    ])
    expect(found.callees.items.map((edge) => shorthandOf(edge.to))).toEqual([
      'src/payments.ts#audit',
      'src/payments.ts#post',
    ])

    // The type the subject names and never calls, which is the half `callers`
    // cannot see and the reason `references` was built before this.
    expect(
      found.references.items.map((edge) => [shorthandOf(edge.to), edge.kind]),
    ).toEqual([
      ['src/types.ts#Money', 'typeReferences'],
      ['src/types.ts#Money', 'typeReferences'],
    ])

    // ADR 0003's join: a label rides on the file, and the symbol does not
    // inherit it — every label here names the file it was filed against.
    expect(found.labels.items.length).toBeGreaterThan(0)
    for (const label of found.labels.items) {
      expect(label.node).toBe('src/payments.ts')
    }
  })

  it('applies `--limit` per kind, and reports truncation per kind', () => {
    const found = report(ask('charge', 2))

    // Three callers against a limit of two: this kind is cut and says so.
    expect(found.callers.budget).toEqual({
      returned: 2,
      available: 3,
      truncated: true,
    })
    // Two callees against the same limit: untouched, and out of the same pool a
    // shared budget would have spent on the third caller.
    expect(found.callees.budget).toEqual({
      returned: 2,
      available: 2,
      truncated: false,
    })
    expect(found.callees.items).toHaveLength(2)
    expect(found.files.items).toHaveLength(1)
  })

  it("sums the kinds into the subject's own budget", () => {
    const envelope = ask('charge', 2)
    const { claims, ...kinds } = report(envelope)
    const budgets = Object.values(kinds).map((kind) => kind.budget)
    expect(entry(envelope).budget.returned).toBe(
      budgets.reduce((sum, budget) => sum + budget.returned, 0),
    )
    expect(entry(envelope).budget.available).toBe(
      budgets.reduce((sum, budget) => sum + budget.available, 0),
    )
    // One kind was cut, so the entry says something was — and only the kinds
    // say which.
    expect(entry(envelope).budget.truncated).toBe(true)
    expect(claims).toBeNull()
  })

  it('gives each kind the order its own operation would have given it', () => {
    const session = openSession({ cwd: root, noUpdate: false })
    try {
      const alone = callers(
        session.store,
        session.context,
        ['charge'],
        null,
        UNSCOPED,
      )
      const assembled = evidence(
        session.store,
        session.context,
        ['charge'],
        null,
        { scoping: UNSCOPED, claims: false },
      )
      expect(report(assembled).callers.items).toEqual(alone.result?.[0]?.result)
    } finally {
      session.close()
    }
  })

  it('restates the payload as claim expressions only when asked', () => {
    expect(report(ask('charge')).claims).toBeNull()

    const claims = report(ask('charge', null, { claims: true })).claims ?? []
    expect(claims).toContain('exists(src/payments.ts#charge)')
    expect(claims).toContain(
      'calls(src/callers.ts#one, src/payments.ts#charge)',
    )
    expect(claims).toContain(
      'calls(src/payments.ts#charge, src/payments.ts#audit)',
    )
    // `typeReferences` is the edge kind; `usesType` is ADR 0005's predicate.
    expect(claims).toContain(
      'usesType(src/payments.ts#charge, src/types.ts#Money)',
    )
    expect(claims).toContain('hasLabel(src/payments.ts, role, source)')

    // Two sites between one pair are two facts and one claim.
    expect(new Set(claims).size).toBe(claims.length)
    expect(
      claims.filter((claim) =>
        claim.startsWith('usesType(src/payments.ts#charge'),
      ),
    ).toHaveLength(1)
  })

  it('says so when the subject lives in a syntactic file', () => {
    const envelope = ask('charge', null, { cwd: unprepared })
    expect(report(envelope).files.items[0]?.fidelity).toBe('syntactic')
    expect(report(envelope).files.items[0]?.cause).toBe('unprepared')
    // The same fact in the envelope, for the projects this answer touched.
    expect(envelope.conditions.map((row) => row.fidelity)).toContain(
      'syntactic',
    )
  })

  it('names nothing rather than guessing when the subject matches nothing', () => {
    const envelope = ask('NoSuchSymbol')
    expect(entry(envelope).resolved).toEqual([])
    expect(report(envelope).callers.items).toEqual([])
    expect(entry(envelope).budget.available).toBe(0)
  })

  describe('ADR 0014: several subjects in one call', () => {
    it('keys the result by subject, one entry per subject given', () => {
      const envelope = askMany(['charge', 'audit'])
      expect(envelope.result?.map((found) => found.subject)).toEqual([
        'charge',
        'audit',
      ])
    })

    it('bounds each subject on its own, never pooling across the batch', () => {
      // `charge` has three callers and `audit` has one; at `--limit 2` a shared
      // pool would let `charge` alone spend the whole budget. Batching the two
      // must answer exactly as asking about `charge` alone would.
      const batched = askMany(['charge', 'audit'], 2)
      const [chargeEntry, auditEntry] = batched.result ?? []
      expect(chargeEntry?.subject).toBe('charge')
      expect(chargeEntry?.result).toEqual(report(ask('charge', 2)))
      expect(auditEntry?.subject).toBe('audit')
      expect(auditEntry?.result.callers.items).toHaveLength(1)
    })

    it('is keyed by subject the same way for one subject as for many', () => {
      // ADR 0014: the shape must not depend on how many subjects a call
      // happened to pass — a single subject still comes back as one entry.
      const one = askMany(['charge'])
      expect(one.result).toHaveLength(1)
      expect(one.result?.[0]?.subject).toBe('charge')
    })

    it('gives an ambiguous subject its own entry, not a merge with its neighbours', () => {
      const envelope = askMany(['NoSuchSymbol', 'charge'])
      const [missing, found] = envelope.result ?? []
      expect(missing?.subject).toBe('NoSuchSymbol')
      expect(missing?.resolved).toEqual([])
      expect(missing?.result.callers.items).toEqual([])
      expect(found?.subject).toBe('charge')
      expect(found?.resolved).not.toEqual([])
    })
  })
})
