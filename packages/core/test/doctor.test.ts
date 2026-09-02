/**
 * `doctor`: the four signals read whole, and the first operation that can fail.
 *
 * Everything here is already measured and stored per answer — what these pin is
 * the two things reading it whole adds. One cause is one finding however many
 * signals evidenced it, so a single absent install is not reported once by the
 * filesystem and again by every file that noticed; and the exit code follows the
 * cause, so it says "there is something you can act on" rather than "something
 * is imperfect".
 */

import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { doctor, type DoctorEnvelope } from '../src/operations/doctor.ts'
import { openSession } from '../src/session/index.ts'

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'basic',
)
let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'codedocs-doctor-'))
  cpSync(fixture, root, { recursive: true })
  manifest()
  writeFileSync(join(root, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n")
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** The repository's manifest, with whatever dependencies a test declares. */
function manifest(dependencies: Record<string, string> = {}): void {
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'fixture', private: true, dependencies }),
  )
}

/** Put a file on disk, making its directory first. */
function write(path: string, content = 'export {}\n'): void {
  mkdirSync(join(root, dirname(path)), { recursive: true })
  writeFileSync(join(root, path), content)
}

/** Install, as far as anything below the preflight module can tell one apart. */
function install(name = 'left-pad'): void {
  write(`node_modules/${name}/package.json`, `{"name":"${name}"}\n`)
  write(`node_modules/${name}/index.d.ts`, 'export {}\n')
}

/** Run `doctor` over a real session, exactly as the binding does. */
function run(measure = false): DoctorEnvelope {
  const session = openSession({ cwd: root, noUpdate: false })
  try {
    return doctor(session.store, session.context, null, {
      root: session.root,
      config: session.config,
      measure,
      seenFiles: session.seenFiles,
    })
  } finally {
    session.close()
  }
}

describe('the whole set, rather than one answer’s slice', () => {
  it('names every project’s fidelity with its cause and its command', () => {
    const envelope = run()

    expect(envelope.result).toEqual([
      {
        project: 'tsconfig.json',
        cause: 'unprepared',
        fidelity: 'syntactic',
        signal: true,
        postinstall: false,
        remediable: true,
        remediations: ['pnpm install'],
        specifiers: [],
      },
    ])
  })

  it('reports the index header, which names the tool that built it', () => {
    const { header } = run()

    expect(header.toolVersion).not.toBe('unknown')
    expect(header.typescriptVersion).not.toBe('unknown')
    expect(header.projects).toBe(1)
    expect(header.files).toBeGreaterThan(0)
  })

  it('says nothing at all about a repository with nothing to say', () => {
    install()
    expect(run().result).toEqual([])
    expect(run().remediable).toBe(0)
  })
})

describe('deduplicating a cause across the signals that saw it', () => {
  it('reports one absent install once, not once per signal and site', () => {
    // Signal 1 fires for the project — no `node_modules` — and every file that
    // imports the declared package says the same thing at the level of a site.
    // ADR 0009: the two are one finding at different granularity.
    manifest({ 'left-pad': '^1.0.0' })
    write(
      'src/one.ts',
      "import 'left-pad'\nexport const one = (): number => 1\n",
    )
    write(
      'src/two.ts',
      "import 'left-pad'\nexport const two = (): number => 2\n",
    )

    const found = run().result ?? []

    expect(found).toHaveLength(1)
    expect(found[0]?.cause).toBe('unprepared')
    // Both halves are kept: the project-wide signal, and the sites that agree.
    expect(found[0]?.signal).toBe(true)
    expect(found[0]?.specifiers).toEqual([
      {
        specifier: 'left-pad',
        sites: 2,
        files: ['src/one.ts', 'src/two.ts'],
        remediation: null,
      },
    ])
  })

  it('separates two causes under one project, because they are two findings', () => {
    install()
    install('@scope/pkg')
    write(
      'src/app.ts',
      "import '@scope/pkg/enums'\nimport './nowhere'\nexport const app = (): number => 1\n",
    )

    const causes = (run().result ?? []).map((found) => found.cause)

    // Sorted remediable first, which is the order the causes are declared in.
    expect(causes).toEqual(['missing-generated', 'broken'])
  })
})

describe('remediations, and the silences ADR 0001 requires', () => {
  it('derives `unprepared`’s command from the lockfile', () => {
    rmSync(join(root, 'pnpm-lock.yaml'))
    writeFileSync(join(root, 'yarn.lock'), '# yarn lockfile v1\n')

    expect(run().result?.[0]?.remediations).toEqual(['yarn install'])
  })

  it('offers no command where there is no lockfile to read one from', () => {
    // ADR 0001 refuses a remediation that would send a user the wrong way, so
    // an undeterminable command is absent rather than guessed at.
    rmSync(join(root, 'pnpm-lock.yaml'))

    const found = run().result?.[0]
    expect(found?.remediations).toEqual([])
    // Still remediable: an install would clear it, whatever spells it.
    expect(found?.remediable).toBe(true)
  })

  it('takes `missing-generated`’s command from codedocs.jsonc', () => {
    install()
    install('@scope/pkg')
    write('src/app.ts', "import '@scope/pkg/enums'\nexport const app = 1\n")
    writeFileSync(
      join(root, 'codedocs.jsonc'),
      '{"remediations": [{"specifier": "@scope/pkg/*", "run": "pnpm generate"}]}\n',
    )

    const found = run().result?.[0]
    expect(found?.remediations).toEqual(['pnpm generate'])
    expect(found?.specifiers[0]?.remediation).toBe('pnpm generate')
  })

  it('names the specifier and offers nothing where the config is silent', () => {
    // There is no built-in framework table, deliberately: a shipped one would
    // rot on every release and hand a user a command that sends them the wrong
    // way.
    install()
    install('@scope/pkg')
    write('src/app.ts', "import '@scope/pkg/enums'\nexport const app = 1\n")

    const found = run().result?.[0]
    expect(found?.cause).toBe('missing-generated')
    expect(found?.remediations).toEqual([])
    expect(found?.specifiers[0]?.specifier).toBe('@scope/pkg/enums')
  })

  it('renders `unmapped` and `broken` with no remediation at all', () => {
    // Opposite reasons: nothing would help a `broken` import, and no *command*
    // would help an `unmapped` one.
    install()
    write('src/styles.css', '.a { color: red }\n')
    write(
      'src/app.ts',
      "import './styles.css'\nimport './nowhere'\nexport const app = 1\n",
    )

    const found = run().result ?? []
    expect(found.map((one) => one.cause)).toEqual(['unmapped', 'broken'])
    for (const one of found) {
      expect(one.remediable).toBe(false)
      expect(one.remediations).toEqual([])
    }
  })
})

describe('what the exit code follows', () => {
  it('counts a remediable cause, whichever signal evidenced it', () => {
    install()
    install('@scope/pkg')
    write('src/app.ts', "import '@scope/pkg/enums'\nexport const app = 1\n")

    expect(run().remediable).toBe(1)
  })

  it('counts none where every finding is `unmapped` or `broken`', () => {
    install()
    write('src/app.ts', "import './nowhere'\nexport const app = 1\n")

    expect(run().result).toHaveLength(1)
    expect(run().remediable).toBe(0)
  })

  it('counts over the whole set, so a display limit cannot turn a build green', () => {
    const session = openSession({ cwd: root, noUpdate: false })
    try {
      const envelope = doctor(session.store, session.context, 0, {
        root: session.root,
        config: session.config,
        measure: false,
        seenFiles: session.seenFiles,
      })
      expect(envelope.result).toEqual([])
      expect(envelope.budget.truncated).toBe(true)
      expect(envelope.remediable).toBe(1)
    } finally {
      session.close()
    }
  })
})

describe('--measure, against the working tree', () => {
  it('is absent unless it was asked for, and it is asked for by name', () => {
    expect(run().measured).toBeNull()
    expect(run(true).measured).toEqual([])
  })

  it('sees a hand-modified node_modules, which the static view cannot', () => {
    // The accepted blind spot: the fingerprint hashes the lockfile rather than
    // the tree it produced, so a package deleted out of an install moves
    // nothing and the index goes on answering at the fidelity it was built
    // with. This is the one thing `--measure` exists for.
    manifest({ 'left-pad': '^1.0.0' })
    install()
    expect(run().conditions[0]?.fidelity).toBe('typed')

    rmSync(join(root, 'node_modules', 'left-pad'), { recursive: true })

    // The static view still has nothing to report, which is the point.
    expect(run().result).toEqual([])

    const measured = run(true).measured ?? []
    expect(measured).toHaveLength(1)
    expect(measured[0]?.signal).toBe('dependencies')
    expect(measured[0]?.project).toBe('tsconfig.json')
    expect(measured[0]?.measured).toContain('left-pad')
  })

  it('analyses nothing, so a diagnostic never costs a cold build', () => {
    manifest({ 'left-pad': '^1.0.0' })
    install()
    const before = run().header

    rmSync(join(root, 'node_modules', 'left-pad'), { recursive: true })
    run(true)

    // The index is the one it was: `--measure` reads the tree and writes
    // nothing, so the analysis it describes has not moved.
    const session = openSession({ cwd: root, noUpdate: false })
    try {
      expect(session.repair).toBeNull()
      expect(session.context.snapshot.analysedAt).not.toBeNull()
    } finally {
      session.close()
    }
    expect(run().header).toEqual(before)
  })

  it('names a project whose tsconfig has gone since it was analysed', () => {
    install()
    run()

    rmSync(join(root, 'tsconfig.json'))

    const measured = run(true).measured ?? []
    expect(measured[0]?.signal).toBe('tsconfig')
    expect(measured[0]?.measured).toContain('gone')
  })
})
