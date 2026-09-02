/**
 * The cold build, one project at a time.
 *
 * Two claims, and they pull against each other. Extracting a project on its own
 * means a call that leaves the project has no in-memory symbol to join against,
 * so the first case is that such a call still produces a whole edge. The second
 * is the reason for the split at all: a build interrupted between two commits
 * leaves the projects it finished, and the next run repairs the rest to exactly
 * what a cold build would have written.
 */

import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { UNSCOPED } from '../src/labels/index.ts'

import { analyse } from '../src/adapter/ts7/index.ts'
import { DEFAULT_CONFIG } from '../src/config/index.ts'
import { discoverProjects } from '../src/discovery.ts'
import { statFile, walkSourceFiles } from '../src/drift.ts'
import { preflightProjects } from '../src/preflight/index.ts'
import { callers } from '../src/operations/calls.ts'
import type { FileNode, FilePath } from '../src/model.ts'
import {
  openSession,
  TOOL_VERSION,
  typescriptVersion,
} from '../src/session/index.ts'
import { beginAnalysis, commitProject, openStore } from '../src/store/index.ts'

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'projects',
)

/**
 * `a-lib` owns `money.ts` and `b-app` owns `checkout.ts`, because a file belongs
 * to the first project whose program contains it and projects sort by config
 * path. So the one call in the fixture crosses a project boundary in the
 * direction the build has to survive.
 */
const LIB = 'a-lib/tsconfig.json'
const APP = 'b-app/tsconfig.json'
const CHARGE = 'a-lib/src/money.ts#charge'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'codedocs-cold-'))
  cpSync(fixture, root, { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** Every fact row the index holds, joined back through the intern tables. */
function dump(): string {
  const session = openSession({ cwd: root, noUpdate: false })
  try {
    const { db } = session.store
    const rows = (sql: string): string => JSON.stringify(db.prepare(sql).all())
    return [
      rows(`select p.path, n.qualified, s.name, s.kind, s.start, s.line
            from symbol s
            join node n on n.id = s.node_id
            join path p on p.id = s.path_id
            order by p.path, n.qualified, s.start`),
      rows(`select fp.path as from_path, fn.qualified as from_qualified,
              tp.path as to_path, tn.qualified as to_qualified, e.line
            from call_edge e
            join node fn on fn.id = e.from_id
            join path fp on fp.id = fn.path_id
            join node tn on tn.id = e.to_id
            join path tp on tp.id = tn.path_id
            order by from_path, from_qualified, to_path, to_qualified, e.line`),
      rows(`select f.path as file, c.path as project, r.root_file_count
            from project r
            join path c on c.id = r.path_id
            join file_project fp on fp.project_id = r.path_id
            join path f on f.id = fp.file_id
            order by project, file`),
    ].join('\n')
  } finally {
    session.close()
  }
}

/**
 * Leave the index as an interruption between two per-project commits would.
 *
 * The same store calls `rebuild` makes, stopping after the first project: the
 * membership and header of the whole build are in, and only `a-lib` has facts.
 */
function halfBuild(): void {
  const configPaths = discoverProjects(root, DEFAULT_CONFIG)
  const result = analyse(root, configPaths)
  const store = openStore(root)
  try {
    beginAnalysis(store, {
      seenFiles: walkSourceFiles(root),
      filesByProject: result.filesByProject,
      header: {
        commit: null,
        analysedAt: new Date().toISOString(),
        toolVersion: TOOL_VERSION,
        typescriptVersion: typescriptVersion(),
        classifyHash: '',
      },
    })

    const owned = result.filesByProject.get(LIB) ?? []
    const mine = new Set<FilePath>(owned)
    const files: FileNode[] = []
    for (const path of owned) {
      const stats = statFile(root, path)
      if (stats) files.push(stats)
    }
    commitProject(store, {
      // The real fingerprint, so the interrupted build is the only thing the
      // next session finds to repair: a placeholder would read as an
      // environment change and re-analyse a project that is already current.
      project: {
        configPath: LIB,
        fidelity: 'syntactic',
        rootFileCount: owned.length,
        analysedAt: new Date().toISOString(),
        fingerprint: preflightProjects(root, [LIB], walkSourceFiles(root)).get(
          LIB,
        )!.fingerprint,
        cause: 'unprepared',
        postinstall: false,
      },
      files,
      exportShapes: new Map(
        owned.map((path) => [path, result.exportShapes.get(path) ?? '']),
      ),
      symbols: result.symbols.filter((row) => mine.has(row.file)),
      declarations: result.declarations.filter((row) => mine.has(row.file)),
      callEdges: result.callEdges.filter((row) => mine.has(row.file)),
      referenceEdges: result.referenceEdges.filter((row) => mine.has(row.file)),
      unresolvedCalls: result.unresolvedCalls.filter((row) =>
        mine.has(row.file),
      ),
      unresolvedSpecifiers: [],
      importEdges: result.importEdges.filter((row) => mine.has(row.from)),
    })
  } finally {
    store.close()
  }
}

describe('a call that leaves its project', () => {
  it('still produces a whole edge', () => {
    // `b-app` is extracted after `a-lib`, so the callee's row is already in the
    // index and the extraction resolves against it rather than in memory. This
    // is the edge the split would silently drop if the order ever stopped
    // holding.
    const session = openSession({ cwd: root, noUpdate: false })
    try {
      const envelope = callers(
        session.store,
        session.context,
        CHARGE,
        null,
        UNSCOPED,
      )
      expect(envelope.result?.map((edge) => edge.from)).toEqual([
        'b-app/src/checkout.ts#go',
      ])
    } finally {
      session.close()
    }
  })
})

describe('a build interrupted between two projects', () => {
  it('keeps the project that finished', () => {
    halfBuild()
    const session = openSession({ cwd: root, noUpdate: true })
    try {
      expect(session.context.conditions.map((row) => row.project)).toEqual([
        LIB,
      ])
    } finally {
      session.close()
    }
  })

  it('names the project it never reached, rather than answering as if complete', () => {
    halfBuild()
    const session = openSession({ cwd: root, noUpdate: true })
    try {
      // ADR 0004: a query in between answers from what exists and names the
      // unanalysed projects. The files of `b-app` did not *change* — drift has
      // nothing to say about them — so this is its own kind of blind spot.
      expect(session.context.blindSpots).toEqual([
        {
          subject: APP,
          reason: expect.stringContaining(
            'never analysed',
          ) as unknown as string,
        },
      ])
      expect(
        callers(session.store, session.context, CHARGE, null, UNSCOPED).result,
      ).toEqual([])
    } finally {
      session.close()
    }
  })

  it('is repaired to exactly what a cold build would have written', () => {
    const cold = dump()
    rmSync(join(root, '.codedocs'), { recursive: true, force: true })
    halfBuild()
    expect(dump()).toBe(cold)
  })

  it('repairs by extracting only the project it never reached', () => {
    halfBuild()
    const session = openSession({ cwd: root, noUpdate: false })
    try {
      expect(session.repair).toEqual({
        kind: 'wave',
        environment: [],
        files: 1,
        waves: 1,
        reason: '',
      })
    } finally {
      session.close()
    }
  })
})
