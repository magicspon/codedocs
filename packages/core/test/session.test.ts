/**
 * The index's lifecycle: build, answer warm, notice an edit, and stay honest
 * when told not to repair.
 */

import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { callers } from '../src/operations/calls.ts'
import { symbol } from '../src/operations/symbol.ts'
import { UNSCOPED } from '../src/labels/index.ts'
import { openSession } from '../src/session/index.ts'
import { shorthandOf } from '../src/symbol-id.ts'

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'basic',
)
let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'codedocs-'))
  cpSync(fixture, root, { recursive: true })
  // With no `.git` above it, `findRepositoryRoot` falls back to the nearest
  // `package.json`, so the temp tree needs one or the walk escapes into the
  // enclosing filesystem.
  writeFileSync(
    join(root, 'package.json'),
    '{"name":"fixture","private":true}\n',
  )
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('openSession', () => {
  it('builds the index on first use, and answers from it', () => {
    const session = openSession({ cwd: root, noUpdate: false })
    try {
      const envelope = callers(
        session.store,
        session.context,
        ['charge'],
        null,
        UNSCOPED,
      )
      expect(
        envelope.result?.[0]?.result.map((edge) => shorthandOf(edge.from)),
      ).toContain('src/checkout.ts#checkout')
    } finally {
      session.close()
    }
  })

  it('reports no blind spots over a clean tree', () => {
    const session = openSession({ cwd: root, noUpdate: false })
    try {
      expect(session.context.blindSpots).toEqual([])
      expect(session.context.snapshot.dirty).toBe(false)
    } finally {
      session.close()
    }
  })

  it('picks up an edit on the next question', () => {
    openSession({ cwd: root, noUpdate: false }).close()
    writeFileSync(
      join(root, 'src', 'extra.ts'),
      "import { charge } from './payments.ts'\nexport const again = (): string => charge(2)\n",
    )

    const session = openSession({ cwd: root, noUpdate: false })
    try {
      const envelope = callers(
        session.store,
        session.context,
        ['charge'],
        null,
        UNSCOPED,
      )
      expect(
        envelope.result?.[0]?.result.map((edge) => shorthandOf(edge.from)),
      ).toContain('src/extra.ts#again')
    } finally {
      session.close()
    }
  })

  it('answers over unrepaired drift, and names the drifted file', () => {
    openSession({ cwd: root, noUpdate: false }).close()
    writeFileSync(join(root, 'src', 'extra.ts'), 'export const unseen = 1\n')

    const session = openSession({ cwd: root, noUpdate: true })
    try {
      // The answer is still given — silence is the one behaviour ruled out.
      const envelope = symbol(
        session.store,
        session.context,
        ['charge'],
        null,
        UNSCOPED,
      )
      expect(envelope.result?.[0]?.result).toHaveLength(1)
      expect(session.context.blindSpots.map((spot) => spot.subject)).toContain(
        'src/extra.ts',
      )
      expect(session.context.snapshot.dirty).toBe(true)
    } finally {
      session.close()
    }
  })

  it('reports truncation rather than silently withholding', () => {
    const session = openSession({ cwd: root, noUpdate: false })
    try {
      const envelope = symbol(
        session.store,
        session.context,
        ['*'],
        2,
        UNSCOPED,
      )
      const entry = envelope.result?.[0]
      expect(entry?.budget.returned).toBe(2)
      expect(entry?.budget.truncated).toBe(true)
      expect(entry?.budget.available).toBeGreaterThan(2)
    } finally {
      session.close()
    }
  })
})
