/**
 * The incremental wave: how far one edit travels, and where it stops.
 *
 * Every case here pins a **file count**, because the count is the whole claim.
 * A wave that is merely correct is a cold rebuild; a wave that is correct and
 * bounded is what makes an edit loop usable. The two directions both matter — a
 * body-only edit that reached the importers would be slow, and a signature
 * change that did not reach them would be wrong.
 */

import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { callers } from '../src/operations/calls.ts'
import { symbol } from '../src/operations/symbol.ts'
import { openSession, type RepairReport } from '../src/session.ts'

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'basic',
)
let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'codedocs-wave-'))
  cpSync(fixture, root, { recursive: true })
  // `findRepositoryRoot` stops at a `package.json`, so the temp tree needs one
  // or the walk escapes into the enclosing filesystem.
  writeFileSync(
    join(root, 'package.json'),
    '{"name":"fixture","private":true}\n',
  )
  // Build cold once, so every case below measures a repair rather than a build.
  openSession({ cwd: root, noUpdate: false }).close()
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const source = (name: string): string =>
  readFileSync(join(root, 'src', name), 'utf8')

const write = (name: string, text: string): void => {
  writeFileSync(join(root, 'src', name), text)
}

/** Repair the index, and report what that cost. */
function repair(): RepairReport {
  const session = openSession({ cwd: root, noUpdate: false })
  try {
    // Every case asserts on the repair, so a missing one is a failing test rather
    // than a silently skipped assertion.
    expect(session.repair).not.toBeNull()
    return session.repair!
  } finally {
    session.close()
  }
}

describe('a body-only edit', () => {
  it('settles in one wave and one file', () => {
    // The returned string changes; `charge`'s signature does not.
    write(
      'payments.ts',
      source('payments.ts').replace(
        '`stripe:${amount}`',
        '`stripe/v2:${amount}`',
      ),
    )

    const report = repair()
    expect(report.kind).toBe('wave')
    expect(report.waves).toBe(1)
    expect(report.files).toBe(1)
  })

  it('leaves the answers it did not touch intact', () => {
    write(
      'payments.ts',
      source('payments.ts').replace(
        '`stripe:${amount}`',
        '`stripe/v2:${amount}`',
      ),
    )
    repair()

    const session = openSession({ cwd: root, noUpdate: false })
    try {
      // The edge into `charge` lives in `checkout.ts`, which the wave never
      // re-extracted. If a bounded extraction dropped it, this is where it shows.
      const envelope = callers(session.store, session.context, 'charge', null)
      expect(envelope.result?.map((edge) => edge.from)).toContain(
        'src/checkout.ts#checkout',
      )
    } finally {
      session.close()
    }
  })
})

describe('an export-shape change', () => {
  it('reaches the importers, and stops where the shape stops moving', () => {
    // `charge` takes a string now, so `payments.ts` and the barrel that
    // re-exports it both change shape — but `checkout.ts` still exports the same
    // three signatures, so the wave ends there.
    write(
      'payments.ts',
      source('payments.ts').replaceAll('amount: number', 'amount: string'),
    )

    const report = repair()
    expect(report.kind).toBe('wave')
    // payments.ts -> {barrel.ts, lazy.ts} -> checkout.ts, and no further.
    expect(report.waves).toBe(3)
    expect(report.files).toBe(4)
  })

  it('reaches a file that only imports dynamically', () => {
    // #30: nothing imports `lazy.ts`, and `lazy.ts` imports `payments.ts` only
    // through `import()`. A sweep that read static specifiers alone left it
    // holding edges into a signature that had moved — and a route, a plugin or a
    // lazily loaded component is exactly the file that is reached this way.
    write(
      'payments.ts',
      source('payments.ts').replaceAll('amount: number', 'amount: string'),
    )
    repair()

    const session = openSession({ cwd: root, noUpdate: false })
    try {
      // Re-extracted, so its call into `charge` is the current one rather than
      // the one the cold build recorded against the old signature.
      const envelope = callers(session.store, session.context, 'charge', null)
      expect(envelope.result?.map((edge) => edge.from)).toContain(
        'src/lazy.ts#loadPayments',
      )
    } finally {
      session.close()
    }
  })

  it('never reaches a file that imports nothing from the edit', () => {
    write(
      'payments.ts',
      source('payments.ts').replaceAll('amount: number', 'amount: string'),
    )
    repair()

    // `component.tsx` imports nothing, so its symbols must still carry the line
    // numbers the cold build gave them.
    const session = openSession({ cwd: root, noUpdate: false })
    try {
      const envelope = symbol(session.store, session.context, 'Badge', null)
      expect(envelope.result?.[0]?.line).toBe(1)
    } finally {
      session.close()
    }
  })
})

describe('the export-shape hash', () => {
  it('notices a member added to an exported interface', () => {
    // ADR 0002's measured trap. An interface reports `any` from
    // `getTypeOfSymbol`, so a hash built only from that sees no change here and
    // the wave never leaves the file — a silently stale index.
    write(
      'payments.ts',
      source('payments.ts').replace(
        'capture(amount: number): string',
        'capture(amount: number): string\n  refund(amount: number): string',
      ),
    )

    const report = repair()
    expect(report.kind).toBe('wave')
    expect(report.waves).toBeGreaterThan(1)
    expect(report.files).toBeGreaterThan(1)
  })

  it('does not propagate on a comment', () => {
    write(
      'payments.ts',
      `// A note that changes nothing.\n${source('payments.ts')}`,
    )

    const report = repair()
    expect(report.waves).toBe(1)
    expect(report.files).toBe(1)
  })
})

describe('a new file', () => {
  it('is analysed without the index having a project for it', () => {
    write(
      'extra.ts',
      "import { charge } from './payments.ts'\nexport const again = (): string => charge(2)\n",
    )

    const report = repair()
    expect(report.kind).toBe('wave')
    expect(report.files).toBe(1)

    const session = openSession({ cwd: root, noUpdate: false })
    try {
      // The edge points into `payments.ts`, which the wave never opened as a
      // file: it was joined through the index.
      const envelope = callers(session.store, session.context, 'charge', null)
      expect(envelope.result?.map((edge) => edge.from)).toContain(
        'src/extra.ts#again',
      )
    } finally {
      session.close()
    }
  })

  it('completes an import that was broken before it existed', () => {
    write(
      'extra.ts',
      "import { later } from './later.ts'\nexport const soon = (): string => later()\n",
    )
    repair()

    // `later.ts` appears afterwards. Nothing about `extra.ts` changed, so only
    // the recorded broken import puts it back in the wave.
    write('later.ts', 'export const later = (): string => "later"\n')
    repair()

    const session = openSession({ cwd: root, noUpdate: false })
    try {
      const envelope = callers(session.store, session.context, 'later', null)
      expect(envelope.result?.map((edge) => edge.from)).toContain(
        'src/extra.ts#soon',
      )
    } finally {
      session.close()
    }
  })
})

describe('a deleted file', () => {
  it('takes its symbols with it, and re-extracts its importers', () => {
    write(
      'extra.ts',
      "import { charge } from './payments.ts'\nexport const again = (): string => charge(2)\n",
    )
    repair()
    rmSync(join(root, 'src', 'extra.ts'))

    const report = repair()
    expect(report.kind).toBe('wave')

    const session = openSession({ cwd: root, noUpdate: false })
    try {
      expect(session.repair).toBeNull() // The tree and the index agree again.
      expect(
        symbol(session.store, session.context, 'again', null).result,
      ).toEqual([])
      // The edge from the deleted file is gone; the pre-existing one is not.
      const envelope = callers(session.store, session.context, 'charge', null)
      const from = envelope.result?.map((edge) => edge.from) ?? []
      expect(from).not.toContain('src/extra.ts#again')
      expect(from).toContain('src/checkout.ts#checkout')
    } finally {
      session.close()
    }
  })
})

describe('a wave and a cold build', () => {
  /**
   * Every row the index holds, in a stable order.
   *
   * The wave's real contract is not that it is fast but that it is
   * indistinguishable: whatever it leaves behind must be what analysing the same
   * tree from scratch would have produced. Comparing counts would pass while
   * pointing at the wrong symbols, so the rows themselves are compared.
   */
  const dump = (): string => {
    const session = openSession({ cwd: root, noUpdate: false })
    try {
      const { db } = session.store
      const rows = (sql: string): string =>
        JSON.stringify(db.prepare(sql).all())
      return [
        rows('select * from symbol order by id, file_path, start'),
        rows(
          'select from_id, to_id, attribution, file_path, line, provenance, derivation from call_edge order by from_id, to_id, file_path, line',
        ),
        rows(
          'select * from unresolved_call order by file_path, line, cause, name',
        ),
        rows('select * from file_import order by from_path, specifier'),
        rows('select * from file_project order by file_path, config_path'),
        rows(
          'select path, content_hash, export_shape_hash from file order by path',
        ),
      ].join('\n')
    } finally {
      session.close()
    }
  }

  /** Throw the index away and analyse the tree from scratch. */
  const cold = (): string => {
    rmSync(join(root, '.codedocs'), { recursive: true, force: true })
    return dump()
  }

  it('agree after an edit that propagates', () => {
    write(
      'payments.ts',
      source('payments.ts').replaceAll('amount: number', 'amount: string'),
    )
    const waved = dump()
    expect(cold()).toBe(waved)
  })

  it('agree after a file is added and another deleted', () => {
    write(
      'extra.ts',
      "import { charge } from './payments.ts'\nexport const again = (): string => charge(2)\n",
    )
    rmSync(join(root, 'src', 'component.tsx'))
    const waved = dump()
    expect(cold()).toBe(waved)
  })
})

describe('a version change', () => {
  it('rebuilds the whole index rather than waving', () => {
    // The one invalidation a wave cannot repair: ADR 0004 discards on a version
    // mismatch rather than migrating, so the repair must fall back to cold.
    const session = openSession({ cwd: root, noUpdate: false })
    session.store.db
      .prepare("update meta set value = ? where key = 'toolVersion'")
      .run('0.0.0-old')
    session.close()

    const report = repair()
    expect(report.kind).toBe('cold')
    expect(report.reason).toContain('0.0.0-old')
    expect(report.files).toBeGreaterThan(1)
  })
})
