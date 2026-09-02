/**
 * `docs check` and `docs affected`: claims, four verdicts, and coverage.
 *
 * The facts worth pinning are the ones ADR 0005 argues hardest for. A vanished
 * subject is **never** `contradicted` — 95 of 105 vanished ids over 60 commits
 * were moves, so a verdict reading "the symbol is gone, therefore the document
 * is wrong" would be wrong most of the time it fired. A verdict never renders
 * without coverage, or `verified` silently means "the checkable part is true".
 * And an ambiguous shorthand is an error in the document rather than a verdict,
 * because a committed artefact must mean one thing.
 */

import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadConfig } from '../src/config/index.ts'
import { discoverDocuments } from '../src/docs/discover.ts'
import { UNSCOPED } from '../src/labels/index.ts'
import { docsAffected, docsCheck } from '../src/operations/docs.ts'
import type { DocsEnvelope } from '../src/operations/docs.ts'
import type { DocumentReport } from '../src/docs/check.ts'
import { openSession } from '../src/session/index.ts'

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'docs',
)

/** A copy of the fixture. `prepared` is what decides its fidelity. */
function plant(prepared: boolean): string {
  const root = mkdtempSync(join(tmpdir(), 'codedocs-docs-'))
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
let renamed: string
let related: string

beforeAll(() => {
  root = plant(true)
  unprepared = plant(false)
  renamed = plantRename()
  related = plantRelations()
})

afterAll(() => {
  for (const one of [root, unprepared, renamed, related]) {
    rmSync(one, { recursive: true, force: true })
  }
})

/** Write one document into a planted root, and answer about it. */
function document(at: string, name: string, body: string): void {
  writeFileSync(join(at, 'docs', `${name}.md`), body)
}

/** Run `docs check` over a real session, as the binding does. */
function check(
  at: string = root,
  options: { drifted?: readonly string[] } = {},
): DocsEnvelope {
  const session = openSession({ cwd: at, noUpdate: false })
  try {
    return docsCheck(session.store, session.context, null, {
      root: session.root,
      config: session.config,
      scoping: UNSCOPED,
      labels: session.labels(),
      drifted: options.drifted ?? [],
      failOn: null,
      base: null,
    })
  } finally {
    session.close()
  }
}

/** One document out of an answer, by the tail of its path. */
const documentAt = (
  envelope: DocsEnvelope,
  name: string,
): DocumentReport | undefined =>
  (envelope.result ?? []).find((one) => one.path.endsWith(`${name}.md`))

/** Every claim in a document, flattened out of its sections. */
const claimsOf = (report: DocumentReport | undefined) =>
  (report?.sections ?? []).flatMap((section) => section.claims)

const claimNamed = (report: DocumentReport | undefined, text: string) =>
  claimsOf(report).find((claim) => claim.text.includes(text))

describe('discovery', () => {
  it('finds documents by their marker, with no configuration', () => {
    const envelope = check()
    expect(envelope.result?.map((one) => one.path)).toContain(
      'docs/payments.md',
    )
    // Every Markdown file is read; only the ones carrying a marker are
    // documents, and the fixture's own README carries none.
    expect(envelope.scan.scanned).toBeGreaterThan(envelope.scan.documents)
    expect(documentAt(envelope, 'README')).toBeUndefined()
  })

  it('reads a fenced example as an example, not as a claim', () => {
    document(
      root,
      'fenced',
      [
        '# Fenced',
        '',
        'This shows the syntax rather than asserting anything:',
        '',
        '```markdown',
        '<!-- codedocs: calls(src/nowhere.ts#gone, src/nowhere.ts#also) -->',
        '```',
      ].join('\n'),
    )
    // ADR 0005's own text carries a claim inside a fence; a scan that read it
    // would make the decision document a document.
    expect(documentAt(check(), 'fenced')).toBeUndefined()
  })
})

describe('the four verdicts', () => {
  it('verifies a document whose every claim holds, and reports its coverage', () => {
    const report = documentAt(check(), 'payments')
    expect(report?.verdict).toBe('verified')
    // Five sections, three of which carry a claim. The two that do not are
    // reported rather than hidden, which is what stops `verified` overstating
    // itself — and the empty run before the first heading is not a section.
    expect(report?.coverage.sections).toBe(5)
    expect(report?.coverage.covered).toBe(3)
    for (const claim of claimsOf(report)) {
      expect(claim.verdict).toBe('verified')
    }
  })

  it('contradicts a claim the index falsifies, and names the section', () => {
    document(
      root,
      'wrong',
      [
        '# Wrong',
        '',
        'The audit charges, which it does not.',
        '',
        '<!-- codedocs: calls(src/payments.ts#audit, src/payments.ts#charge) -->',
      ].join('\n'),
    )
    const report = documentAt(check(), 'wrong')
    expect(report?.verdict).toBe('contradicted')
    const section = report?.sections.find((one) => one.heading === 'Wrong')
    expect(section?.verdict).toBe('contradicted')
    expect(section?.claims[0]?.reason).toBe('falsified')
  })

  it('contradicts a count that differs, and says what the index holds', () => {
    document(
      root,
      'counted',
      [
        '# Counted',
        '',
        '<!-- codedocs: implementations(src/types.ts#Gateway) == 3 -->',
      ].join('\n'),
    )
    const claim = claimNamed(documentAt(check(), 'counted'), 'implementations')
    expect(claim?.verdict).toBe('contradicted')
    expect(claim?.reason).toBe('count-differs')
    expect(claim?.observed).toBe(2)
  })

  it('contradicts a prose link naming a file that is not there', () => {
    document(
      root,
      'linked',
      [
        '# Linked',
        '',
        'See [the gateway](../src/gone.ts) and [the real one](../src/payments.ts).',
        '',
        '<!-- codedocs: exists(src/payments.ts#charge) -->',
      ].join('\n'),
    )
    const report = documentAt(check(), 'linked')
    expect(report?.verdict).toBe('contradicted')
    const links = report?.sections.flatMap((one) => one.links) ?? []
    expect(links.find((one) => one.path === 'src/gone.ts')?.broken).toBe(true)
    expect(links.find((one) => one.path === 'src/payments.ts')?.broken).toBe(
      false,
    )
  })

  it('reports `unable to verify` for a subject in a syntactic file', () => {
    const report = documentAt(check(unprepared), 'payments')
    expect(report?.verdict).toBe('unable-to-verify')
    expect(claimsOf(report).map((claim) => claim.reason)).toContain('syntactic')
  })

  it('reports `potentially stale` when a file the document touches changed', () => {
    const report = documentAt(
      check(root, { drifted: ['src/payments.ts'] }),
      'payments',
    )
    // Every claim still holds; the derived scope is the only producer of this.
    expect(report?.verdict).toBe('potentially-stale')
    for (const claim of claimsOf(report)) {
      expect(claim.verdict).toBe('verified')
    }
  })
})

describe('a subject that moved', () => {
  it('is `unable to verify` with a rename candidate, never `contradicted`', () => {
    const report = documentAt(check(renamed), 'moved')
    expect(report?.verdict).toBe('unable-to-verify')
    const claim = claimsOf(report)[0]
    expect(claim?.reason).toBe('unresolved')
    // The git probe found where the file went, and `R100` is byte-identity
    // rather than a similarity judgement.
    const candidate = claim?.candidates[0]
    expect(candidate?.id).toBe('src/new.ts#relocated')
    expect(candidate?.derivations).toContain('content-hash')
    expect(candidate?.derivations).toContain('git-rename')
    expect(candidate?.similarity).toBe(100)
    expect(candidate?.commit).not.toBeNull()
  })
})

describe('errors in the document', () => {
  const faultsFor = (body: string): readonly string[] => {
    document(root, 'faulty', body)
    return (documentAt(check(), 'faulty')?.faults ?? []).map(
      (one) => one.fault.code,
    )
  }

  it('refuses an ambiguous shorthand rather than calling it unverifiable', () => {
    // `capture` is declared by both gateways, so it names two symbols.
    document(root, 'faulty', '# Faulty\n\n<!-- codedocs: exists(capture) -->\n')
    const fault = documentAt(check(), 'faulty')?.faults[0]?.fault
    expect(fault?.code).toBe('ambiguous-subject')
    // Named, not counted: the author has to pick one, and the candidates are
    // what they pick from.
    expect(
      fault?.code === 'ambiguous-subject' ? fault.resolved.length : 0,
    ).toBeGreaterThan(1)
  })

  it('refuses a claim anchored to a local symbol', () => {
    const faults = faultsFor(
      '# Faulty\n\n<!-- codedocs: exists(src/payments.ts#withLocal.helper) -->\n',
    )
    expect(faults).toEqual(['local-subject'])
  })

  it('refuses a predicate no backend produces, saying which', () => {
    const faults = faultsFor(
      '# Faulty\n\n<!-- codedocs: exports(src/payments.ts, charge) -->\n' +
        '<!-- codedocs: dependsOn(a, b) -->\n',
    )
    expect(faults).toEqual(['no-backend', 'no-backend'])
  })

  // cspell:ignore frobnicates — a predicate nothing produces, which is the point
  it('refuses an unknown predicate, a bad arity and a bad comparison', () => {
    expect(
      faultsFor('# Faulty\n\n<!-- codedocs: frobnicates(a, b) -->\n'),
    ).toEqual(['unknown-predicate'])
    expect(
      faultsFor(
        '# Faulty\n\n<!-- codedocs: calls(src/payments.ts#charge) -->\n',
      ),
    ).toEqual(['arity'])
    expect(
      faultsFor(
        '# Faulty\n\n<!-- codedocs: callers(src/payments.ts#audit) >= 1 -->\n',
      ),
    ).toEqual(['count-invalid'])
    expect(
      faultsFor('# Faulty\n\n<!-- codedocs: not a claim at all -->\n'),
    ).toEqual(['unparseable'])
  })

  it('refuses a label outside the vocabulary', () => {
    const faults = faultsFor(
      '# Faulty\n\n<!-- codedocs: hasLabel(src/payments.ts, role, nonsense) -->\n',
    )
    expect(faults).toEqual(['label-invalid'])
  })
})

describe('a document’s derived scope', () => {
  /** The files one document's claims and links resolve to. */
  const scopeOf = (body: string): readonly string[] => {
    document(root, 'scoped', body)
    return documentAt(check(), 'scoped')?.scope ?? []
  }

  it('reads a link relative to the document, and one written from the root', () => {
    const scope = scopeOf(
      [
        '# Scoped',
        '',
        'See [up](../src/payments.ts), [rooted](/src/checkout.ts) and',
        '[here](./payments.md).',
        '',
        '<!-- codedocs: exists(src/payments.ts#charge) -->',
      ].join('\n'),
    )
    expect(scope).toContain('src/payments.ts')
    expect(scope).toContain('src/checkout.ts')
    expect(scope).toContain('docs/payments.md')
  })

  it('leaves a link out of this repository out of the scope', () => {
    const scope = scopeOf(
      [
        '# Scoped',
        '',
        'See [the spec](https://example.test/spec).',
        '',
        '<!-- codedocs: exists(src/payments.ts#charge) -->',
      ].join('\n'),
    )
    expect(scope).toEqual(['src/payments.ts'])
  })

  it('reads a path out of a claim’s text, and reads an axis as no path at all', () => {
    // `role` and `source` are arguments, not files. The subject still reaches
    // the scope, because it resolved to one.
    expect(
      scopeOf(
        '# Scoped\n\n<!-- codedocs: hasLabel(charge, role, source) -->\n',
      ),
    ).toEqual(['src/payments.ts'])
  })
})

describe('the relation predicates', () => {
  /** Check one claim written into the relations fixture, by its predicate. */
  const claimFor = (text: string) => {
    document(
      related,
      'relations',
      `# Relations\n\n<!-- codedocs: ${text} -->\n`,
    )
    return claimsOf(documentAt(check(related), 'relations'))[0]
  }

  it('reads each relation off its own edge kind', () => {
    expect(claimFor('imports(src/checkout.ts, src/payments.ts)')?.verdict).toBe(
      'verified',
    )
    expect(
      claimFor('extends(src/shapes.ts#Journal, src/shapes.ts#Ledger)')?.verdict,
    ).toBe('verified')
    expect(
      claimFor(
        'implements(src/payments.ts#StripeGateway, src/types.ts#Gateway)',
      )?.verdict,
    ).toBe('verified')
    expect(
      claimFor('usesType(src/payments.ts#charge, src/types.ts#Money)')?.verdict,
    ).toBe('verified')
  })

  it('falsifies a relation the index holds no edge for', () => {
    const claim = claimFor('imports(src/types.ts, src/checkout.ts)')
    expect(claim?.verdict).toBe('contradicted')
    expect(claim?.reason).toBe('falsified')
  })

  it('walks a diamond once per symbol rather than once per path', () => {
    // Nothing in `shapes.ts` reaches `charge`, so the walk runs to exhaustion —
    // which is the only way it meets `sink` from both middles.
    const claim = claimFor(
      '!reaches(src/shapes.ts#head, src/payments.ts#charge)',
    )
    expect(claim?.verdict).toBe('verified')
    expect(
      claimFor('reaches(src/shapes.ts#head, src/shapes.ts#sink)')?.verdict,
    ).toBe('verified')
  })

  it('doubts a missing edge where an import in the file resolved to nothing', () => {
    // ADR 0001's rule in a *typed* project: an unresolved specifier can
    // manufacture exactly the absence a failing claim rests on.
    const claim = claimFor('calls(src/vendor.ts#report, src/payments.ts#audit)')
    expect(claim?.verdict).toBe('unable-to-verify')
    expect(claim?.reason).toBe('unresolved-specifier')
  })

  it('reports whichever end of a relation vanished, never a contradiction', () => {
    const from = claimFor('calls(src/gone.ts#gone, src/payments.ts#audit)')
    expect(from?.verdict).toBe('unable-to-verify')
    expect(from?.reason).toBe('unresolved')

    const to = claimFor('calls(src/payments.ts#charge, src/gone.ts#gone)')
    expect(to?.verdict).toBe('unable-to-verify')
    expect(to?.reason).toBe('unresolved')
  })

  it('reports an ambiguous end of a relation as an error in the document', () => {
    document(
      related,
      'ambiguous',
      [
        '# Ambiguous',
        '',
        '<!-- codedocs: calls(capture, src/payments.ts#audit) -->',
        '<!-- codedocs: calls(src/payments.ts#charge, capture) -->',
      ].join('\n'),
    )
    const faults = documentAt(check(related), 'ambiguous')?.faults ?? []
    expect(faults.map((one) => one.fault.code)).toEqual([
      'ambiguous-subject',
      'ambiguous-subject',
    ])
  })
})

describe('the other forms', () => {
  const claimFor = (text: string) => {
    document(related, 'forms', `# Forms\n\n<!-- codedocs: ${text} -->\n`)
    return claimsOf(documentAt(check(related), 'forms'))[0]
  }

  const faultFor = (text: string) => {
    document(related, 'forms', `# Forms\n\n<!-- codedocs: ${text} -->\n`)
    return documentAt(check(related), 'forms')?.faults[0]?.fault
  }

  it('verifies a negated `exists` for a subject that is not there', () => {
    // `exists` is the one predicate whose evaluation is the resolution, so an
    // absent subject under a negation is the claim holding rather than a
    // subject that vanished under it.
    const claim = claimFor('!exists(src/gone.ts#gone)')
    expect(claim?.verdict).toBe('verified')
    expect(claim?.candidates).toEqual([])
  })

  it('resolves a subject with no descriptor to the file of that name', () => {
    expect(claimFor('hasLabel(src/payments.ts, role, source)')?.verdict).toBe(
      'verified',
    )
    expect(claimFor('hasLabel(src/payments.ts, role, test)')?.verdict).toBe(
      'contradicted',
    )
  })

  it('reports a label subject that names nothing the index holds', () => {
    const claim = claimFor('hasLabel(src/gone.ts, role, source)')
    expect(claim?.verdict).toBe('unable-to-verify')
    expect(claim?.reason).toBe('unresolved')
  })

  it('reports an ambiguous label subject as an error in the document', () => {
    expect(faultFor('hasLabel(capture, role, source)')?.code).toBe(
      'ambiguous-subject',
    )
  })

  it('takes a directory with or without its trailing slash', () => {
    expect(claimFor('onlyCalledBy(src/payments.ts#audit, src)')?.verdict).toBe(
      'verified',
    )
    expect(claimFor('onlyCalledBy(src/payments.ts#audit, src/)')?.verdict).toBe(
      'verified',
    )
  })

  it('falsifies a scope a caller sits outside of, and counts the callers', () => {
    const claim = claimFor('onlyCalledBy(src/payments.ts#charge, docs/)')
    expect(claim?.verdict).toBe('contradicted')
    expect(claim?.observed).toBeGreaterThan(0)
  })

  it('reports a scoped or counted subject that vanished, and one that is ambiguous', () => {
    expect(claimFor('onlyCalledBy(src/gone.ts#gone, src/)')?.reason).toBe(
      'unresolved',
    )
    expect(faultFor('onlyCalledBy(capture, src/)')?.code).toBe(
      'ambiguous-subject',
    )
    expect(claimFor('callers(src/gone.ts#gone) == 1')?.reason).toBe(
      'unresolved',
    )
    expect(faultFor('callers(capture) == 1')?.code).toBe('ambiguous-subject')
  })
})

describe('docs affected', () => {
  const affected = (
    drifted: readonly string[],
    options: { at?: string; base?: string } = {},
  ): DocsEnvelope => {
    const session = openSession({ cwd: options.at ?? root, noUpdate: false })
    try {
      return docsAffected(session.store, session.context, null, {
        root: session.root,
        config: session.config,
        scoping: UNSCOPED,
        labels: session.labels(),
        drifted,
        failOn: null,
        base: options.base ?? null,
      })
    } finally {
      session.close()
    }
  }

  it('answers about the documents a change reaches, and no others', () => {
    const reached = affected(['src/payments.ts'])
    expect(reached.result?.map((one) => one.path)).toContain('docs/payments.md')
    expect(reached.changed).toEqual(['src/payments.ts'])
  })

  it('answers about nothing when a change reaches no document', () => {
    expect(affected(['src/unrelated.ts']).result).toEqual([])
  })

  it('needs no git at all when the changed set is the drift', () => {
    // The fixture is not a git repository, and the zero-argument case still
    // answers: that is what makes this usable inside a pre-commit hook.
    expect(affected([]).result).toEqual([])
  })

  it('widens the changed set with `--base`, which the drift alone does not', () => {
    // The rename fixture's working tree is clean, so the drift set reaches no
    // document. Only the commit does — which is the whole of what `--base` adds.
    expect(affected([], { at: renamed }).result).toEqual([])

    const widened = affected([], { at: renamed, base: 'HEAD~1' })
    expect(widened.result?.map((one) => one.path)).toContain('docs/moved.md')
    // A rename is both of its paths. Git's detection would name only the
    // destination, and the source is the one the document still claims — so the
    // case where `docs affected` matters most is the one it would hide.
    expect(widened.changed).toContain('src/old.ts')
    expect(widened.changed).toContain('src/new.ts')
  })
})

describe('claim coverage', () => {
  it('counts sections and says nothing about whether the prose is right', () => {
    document(
      root,
      'thin',
      [
        '# Thin',
        '',
        'One claim, three headings.',
        '',
        '<!-- codedocs: exists(src/payments.ts#charge) -->',
        '',
        '## Second',
        '',
        'Prose only.',
        '',
        '## Third',
        '',
        'Prose only.',
      ].join('\n'),
    )
    const report = documentAt(check(), 'thin')
    expect(report?.coverage).toEqual({ covered: 1, sections: 3 })
    // Coverage is not a verdict and never modifies one.
    expect(report?.verdict).toBe('verified')
  })
})

describe('what the scan costs', () => {
  it('measures itself, so "no configuration" stays a measurement', async ({
    annotate,
  }) => {
    // codedocs' own checkout rather than a three-file fixture, and the root
    // rather than `packages/`: the repository's `codedocs.jsonc` skips `repos/`,
    // which is what makes a walk from here both real and repeatable.
    const repository = join(fixture, '..', '..', '..', '..', '..')
    const scan = discoverDocuments(repository, loadConfig(repository))

    // `docs check` prints this on every run, which is where a reader actually
    // meets the number; the annotation is for whoever is reading the test.
    await annotate(
      `marker scan: ${scan.scanned} Markdown files in ${scan.durationMs} ms ` +
        `(${scan.documents.length} documents)`,
    )

    expect(scan.scanned).toBeGreaterThan(0)
    // ADR 0005 rests the whole scheme on discovery needing no configuration and
    // no cache, on the strength of 46 ms over cal.com's 380 Markdown files. A
    // tree this size has to stay far inside that, or the trade is not the one
    // that was made.
    expect(scan.durationMs).toBeLessThan(1000)
  })
})

/**
 * A second fixture, as a git repository whose one rename happened in a commit.
 *
 * ADR 0007's primary signal needs no second index but does need history: the
 * probe asks which commit removed the path, then asks that one commit what it
 * did. Two commits is the smallest thing that can answer.
 */
function plantRename(): string {
  const at = plant(true)
  const git = (...args: string[]): void => {
    execFileSync('git', args, { cwd: at, stdio: 'ignore' })
  }
  writeFileSync(
    join(at, 'src', 'old.ts'),
    '/** The subject a document claims, before it moved. */\n' +
      'export function relocated(): number {\n  return 1\n}\n',
  )
  writeFileSync(
    join(at, 'docs', 'moved.md'),
    '# Moved\n\n<!-- codedocs: exists(src/old.ts#relocated) -->\n',
  )
  git('init', '--quiet')
  git('config', 'user.email', 'fixture@example.com')
  git('config', 'user.name', 'fixture')
  git('add', '-A')
  git('commit', '--quiet', '-m', 'first')
  git('mv', 'src/old.ts', 'src/new.ts')
  git('commit', '--quiet', '-m', 'move it')
  return at
}

/**
 * A fourth fixture, holding the shapes the first one's three files do not.
 *
 * The relation predicates each read a different edge kind, and a claim checked
 * against an edge kind nothing in the tree produces would pass for the wrong
 * reason. The same goes for the two things that make a verdict `unable to
 * verify` in a *typed* project: an import that resolved to nothing, and a
 * subject that resolved to nothing.
 */
function plantRelations(): string {
  const at = plant(true)
  writeFileSync(
    join(at, 'src', 'shapes.ts'),
    [
      '/** A base, so `extends` has an edge to read. */',
      'export class Ledger {',
      '  record(amount: number): string {',
      '    return `ledger:${amount}`',
      '  }',
      '}',
      '',
      '/** Extends it. */',
      'export class Journal extends Ledger {}',
      '',
      '/** A diamond: both middles reach `sink`, so the walk meets it twice. */',
      'export function head(): number {',
      '  return left() + right()',
      '}',
      '',
      'export function left(): number {',
      '  return sink()',
      '}',
      '',
      'export function right(): number {',
      '  return sink()',
      '}',
      '',
      'export function sink(): number {',
      '  return 1',
      '}',
      '',
    ].join('\n'),
  )
  writeFileSync(
    join(at, 'src', 'vendor.ts'),
    [
      "import { missing } from 'not-a-real-package'",
      '',
      '/** Everything it does goes through a specifier codedocs could not resolve. */',
      'export function report(): unknown {',
      '  return missing()',
      '}',
      '',
    ].join('\n'),
  )
  return at
}
