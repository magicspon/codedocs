/**
 * `docs draft`: a Markdown file of facts, and not one claim.
 *
 * ADR 0013 rests on one thing being true, and the first two tests here are it:
 * every claim a draft writes parses, and none of them is a claim yet. If a
 * drafted file ever becomes a document without somebody editing it, the coverage
 * measure ADR 0005 built is reporting on prose nobody wrote.
 */

import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DEFAULT_CONFIG } from '../src/config/index.ts'
import { discoverDocuments } from '../src/docs/discover.ts'
import { parseClaim } from '../src/docs/claim.ts'
import { MARKER } from '../src/docs/document.ts'
import { UNSCOPED } from '../src/labels/index.ts'
import { draft, type DraftReport } from '../src/operations/draft.ts'
import { CANDIDATE_MARKER } from '../src/operations/draft-markdown.ts'
import { evidence } from '../src/operations/evidence.ts'
import { openSession } from '../src/session/index.ts'
import type { Envelope } from '../src/envelope.ts'

// The `evidence` fixture: `charge` has two callees, three callers and a type it
// only names, which is exactly the spread a section has to render.
const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'evidence',
)

/** A copy of the fixture, prepared or not, which is what decides its fidelity. */
function plant(prepared: boolean): string {
  const root = mkdtempSync(join(tmpdir(), 'codedocs-draft-'))
  cpSync(fixture, root, { recursive: true })
  writeFileSync(
    join(root, 'package.json'),
    '{"name":"fixture","private":true}\n',
  )
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

/** Run `docs draft` over a real session, as the binding does. */
function ask(
  subject: string,
  limit: number | null = null,
  cwd: string = root,
): Envelope<DraftReport> {
  const session = openSession({ cwd, noUpdate: false })
  try {
    return draft(session.store, session.context, subject, limit, {
      scoping: UNSCOPED,
    })
  } finally {
    session.close()
  }
}

const report = (envelope: Envelope<DraftReport>): DraftReport => {
  const found = envelope.result
  if (found === undefined) throw new Error('the draft carried no result')
  return found
}

describe('what a draft asserts', () => {
  it('writes candidates, and therefore no document', () => {
    const markdown = report(ask('charge')).markdown
    expect(markdown).toContain(CANDIDATE_MARKER)
    // The load-bearing line of ADR 0013: the discovery scan tests for `MARKER`,
    // and the candidate marker is not a case of it.
    expect(markdown).not.toContain(MARKER)
  })

  it('is not discovered as a document until a `?` is deleted', () => {
    const markdown = report(ask('charge')).markdown
    writeFileSync(join(root, 'notes.md'), markdown)
    expect(discoverDocuments(root, DEFAULT_CONFIG).documents).toHaveLength(0)

    // One `?` deleted is one claim endorsed, and one claim is a document. The
    // marker rather than the bare text: the preamble explains the `?`, and the
    // first mention of it in the file is that explanation.
    writeFileSync(
      join(root, 'notes.md'),
      markdown.replace(CANDIDATE_MARKER, MARKER),
    )
    const found = discoverDocuments(root, DEFAULT_CONFIG).documents
    expect(found).toHaveLength(1)
    expect(found[0]?.sections.flatMap((one) => one.claims)).toHaveLength(1)
    rmSync(join(root, 'notes.md'))
  })

  it('offers only claims that parse', () => {
    // An unparseable candidate is worse than none: it is offered as syntax to
    // endorse, and the endorsement is what makes it an error in the document.
    for (const section of report(ask('src/payments.ts')).sections) {
      for (const candidate of section.candidates) {
        expect(parseClaim(candidate), candidate).toMatchObject({ ok: true })
      }
    }
  })

  it('offers each claim once across the whole draft', () => {
    const all = report(ask('src/payments.ts')).sections.flatMap(
      (section) => section.candidates,
    )
    expect(all).toHaveLength(new Set(all).size)
  })

  it('never anchors a candidate to a local symbol', () => {
    // ADR 0002 forbids anything durable anchoring to a local, and ADR 0005
    // refuses such a claim at check time, so offering one is offering an error.
    writeFileSync(
      join(root, 'src', 'locals.ts'),
      'export function outer(): number {\n' +
        '  function inner(): number {\n' +
        '    return 1\n' +
        '  }\n' +
        '  return inner()\n' +
        '}\n',
    )
    const drafted = report(ask('src/locals.ts'))
    expect(drafted.sections.map((section) => section.heading)).toEqual([
      'src/locals.ts',
      'outer',
    ])
    const offered = drafted.sections.flatMap((section) => section.candidates)
    expect(offered.filter((claim) => claim.includes('inner'))).toEqual([])
    rmSync(join(root, 'src', 'locals.ts'))
  })
})

describe('what a draft holds', () => {
  it('drafts one section for a symbol, headed by its qualified name', () => {
    const drafted = report(ask('charge'))
    expect(drafted.sections).toHaveLength(1)
    expect(drafted.sections[0]?.heading).toBe('charge')
    expect(drafted.markdown).toContain('## charge')
  })

  it('drafts a file as itself plus a section per durable symbol', () => {
    const drafted = report(ask('src/payments.ts'))
    expect(drafted.sections.map((section) => section.heading)).toEqual([
      'src/payments.ts',
      'audit',
      'charge',
      'post',
    ])
  })

  it('writes the facts `evidence` answers with, and does not disagree', () => {
    const session = openSession({ cwd: root, noUpdate: false })
    const facts = (() => {
      try {
        return evidence(session.store, session.context, ['charge'], null, {
          scoping: UNSCOPED,
          claims: true,
        })
      } finally {
        session.close()
      }
    })()
    const drafted = report(ask('charge'))
    const chargeFacts = facts.result?.[0]?.result
    for (const edge of chargeFacts?.callers.items ?? []) {
      expect(drafted.markdown).toContain(`${edge.file}:${edge.line}`)
    }
    // The candidates are `evidence --claims`, narrowed to the ones this section
    // is named in — never a claim that operation would not have offered.
    const offered = new Set(chargeFacts?.claims ?? [])
    for (const candidate of drafted.sections[0]?.candidates ?? []) {
      expect(offered.has(candidate), candidate).toBe(true)
    }
  })

  it('asks the question it cannot answer, and writes no prose', () => {
    expect(report(ask('charge')).markdown).toContain(
      'codedocs does not know, and will not guess',
    )
  })

  it('carries no timestamp, so the same commit drafts the same bytes', () => {
    expect(report(ask('charge')).markdown).toBe(report(ask('charge')).markdown)
  })
})

describe('bounding a draft', () => {
  it('counts sections, and leaves the facts inside one whole', () => {
    const bounded = ask('src/payments.ts', 2)
    expect(bounded.budget).toMatchObject({
      returned: 2,
      available: 4,
      truncated: true,
    })
    // `charge` is not among the two sections, so the truncation is by section.
    expect(report(bounded).sections).toHaveLength(2)
    // The whole draft says so, where a reader of the committed file will see it.
    expect(report(bounded).markdown).toContain('2 of 4 sections')
  })

  it('reports a file as one resolution, not as an ambiguous subject', () => {
    // Its sections are its symbols; echoing those would read as ambiguity.
    expect(ask('src/payments.ts').request.resolved).toEqual(['src/payments.ts'])
  })
})

describe('honesty a committed file has to carry', () => {
  it('names a syntactic file in the draft itself', () => {
    const markdown = report(ask('charge', null, unprepared)).markdown
    expect(markdown).toContain('syntactically')
    expect(markdown).toContain('codedocs doctor')
  })

  it('names the commit it was taken at', () => {
    const markdown = report(ask('charge')).markdown
    expect(markdown).toContain('Drafted by codedocs')
  })
})
