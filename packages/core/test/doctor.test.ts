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

import { execFileSync } from 'node:child_process'

import { DEFAULT_CONFIG } from '../src/config/index.ts'
import { UNSCOPED } from '../src/labels/index.ts'
import { analyse } from '../src/operations/analyse.ts'
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

/**
 * Run `doctor` over a real session, exactly as the binding does.
 *
 * `noUpdate` is what `--measure` is worth reading against: a session that
 * repairs first re-analyses the project it is about to measure, so the tree and
 * the index agree by construction and every signal is silent.
 */
function run(measure = false, noUpdate = false): DoctorEnvelope {
  const session = openSession({ cwd: root, noUpdate })
  try {
    return doctor(session.store, session.context, null, {
      root: session.root,
      config: session.config,
      measure,
      seenFiles: session.seenFiles,
      scoping: UNSCOPED,
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
        scoping: UNSCOPED,
      })
      expect(envelope.result).toEqual([])
      expect(envelope.budget.truncated).toBe(true)
      expect(envelope.remediable).toBe(1)
    } finally {
      session.close()
    }
  })
})

describe('two projects', () => {
  /** A second project, with a config of its own. */
  const second = (): void => {
    write('apps/web/src/app.ts', "import './nowhere'\nexport const app = 1\n")
    writeFileSync(
      join(root, 'apps', 'web', 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { target: 'ES2022', module: 'ESNext', noEmit: true },
        include: ['src'],
      }),
    )
  }

  it('reports each project’s findings under its own row, ordered by path', () => {
    install()
    second()
    write('src/app.ts', "import './also-nowhere'\nexport const app = 1\n")

    const found = run().result ?? []
    const projects = found.map((one) => one.project)
    expect(projects).toEqual(['apps/web/tsconfig.json', 'tsconfig.json'])
    // Both are `broken`, which nothing clears — so neither raises the exit code.
    expect(found.every((one) => one.cause === 'broken')).toBe(true)
    expect(run().remediable).toBe(0)
  })

  it('says nothing about a project that has nothing wrong with it', () => {
    // The second project is healthy, so only the one with a finding appears.
    install()
    write('apps/web/src/app.ts', 'export const app = 1\n')
    writeFileSync(
      join(root, 'apps', 'web', 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { target: 'ES2022', module: 'ESNext', noEmit: true },
        include: ['src'],
      }),
    )
    write('src/app.ts', "import './nowhere'\nexport const app = 1\n")

    expect((run().result ?? []).map((one) => one.project)).toEqual([
      'tsconfig.json',
    ])
  })

  it('counts two sites of one specifier once, however many files wrote it', () => {
    install()
    write('src/one.ts', "import './nowhere'\nexport const one = 1\n")
    write('src/two.ts', "import './nowhere'\nexport const two = 2\n")

    const found = run().result ?? []
    expect(found).toHaveLength(1)
    expect(found[0]?.specifiers).toHaveLength(1)
    expect(found[0]?.specifiers[0]?.sites).toBe(2)
    expect(found[0]?.specifiers[0]?.files).toEqual(['src/one.ts', 'src/two.ts'])
  })
})

describe('the baselines it reports', () => {
  /** Turn the fixture into a repository and capture one baseline from it. */
  const commit = (): void => {
    const git = (...args: string[]): void => {
      execFileSync('git', args, { cwd: root, stdio: 'ignore' })
    }
    git('init', '-q')
    git('config', 'user.email', 'fixture@example.com')
    git('config', 'user.name', 'Fixture')
    git('add', '-A')
    git('commit', '-qm', 'first')
  }

  it('holds none outside a repository, and says so rather than counting zero', () => {
    const report = run().baselines
    expect(report.held).toEqual([])
    expect(report.cap).toBe(3)
    expect(report.distance).toBeNull()
  })

  it('names each baseline held and how far HEAD has moved from the newest', () => {
    install()
    commit()
    // `analyse` over a clean tree is the only thing that captures one.
    const session = openSession({ cwd: root, noUpdate: false })
    try {
      analyse(
        session.store,
        session.context,
        null,
        UNSCOPED,
        session.repair,
        session.labelPass,
        { root, cap: DEFAULT_CONFIG.baselines },
      )
    } finally {
      session.close()
    }

    const report = run().baselines
    expect(report.held.length).toBeGreaterThan(0)
    expect(report.held[0]?.ancestor).toBe(true)
    expect(report.distance).toBe(0)
    // The absolute path a baseline is stored at names the machine, so it is
    // left out for the reason `impact` leaves it out.
    expect(Object.keys(report.held[0] ?? {}).sort()).toEqual([
      'ancestor',
      'bytes',
      'commit',
      'committedAt',
    ])
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

  /** Which signals disagreed, in the order `--measure` reports them. */
  const signals = (): readonly string[] =>
    (run(true, true).measured ?? []).map((one) => one.signal)

  it('sees an install that has gone entirely, and one that has arrived', () => {
    install()
    run()
    rmSync(join(root, 'node_modules'), { recursive: true })

    const gone = run(true, true).measured ?? []
    expect(gone.map((one) => one.signal)).toContain('node_modules')
    const one = gone.find((found) => found.signal === 'node_modules')
    expect(one?.indexed).toBe('a node_modules above the project')
    expect(one?.measured).toBe('none')

    // And the other direction: analysed with nothing installed, measured with
    // an install in place.
    rmSync(join(root, '.codedocs'), { recursive: true, force: true })
    run()
    install()
    const arrived = (run(true, true).measured ?? []).find(
      (found) => found.signal === 'node_modules',
    )
    expect(arrived?.indexed).toBe('no node_modules')
    expect(arrived?.measured).toBe('a node_modules above the project')
  })

  it('names three absent dependencies and counts the rest', () => {
    const declared = ['a-pkg', 'b-pkg', 'c-pkg', 'd-pkg', 'e-pkg']
    manifest(Object.fromEntries(declared.map((name) => [name, '^1.0.0'])))
    for (const name of declared) install(name)
    expect(run().conditions[0]?.fidelity).toBe('typed')

    for (const name of declared) {
      rmSync(join(root, 'node_modules', name), { recursive: true })
    }
    const found = (run(true).measured ?? []).find(
      (one) => one.signal === 'dependencies',
    )
    expect(found?.measured).toContain('5 declared dependency(s) absent')
    expect(found?.measured).toContain('a-pkg, b-pkg, c-pkg')
    expect(found?.measured).toContain('and 2 more')
    expect(found?.measured).not.toContain('e-pkg')
  })

  it('sees an install script declared since the index was built', () => {
    install()
    run()
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'fixture',
        private: true,
        scripts: { postinstall: 'node generate.js' },
      }),
    )

    const found = (run(true, true).measured ?? []).find(
      (one) => one.signal === 'postinstall',
    )
    expect(found?.indexed).toBe('no install script')
    expect(found?.measured).toBe('an install script')
  })

  it('sees an install script that has gone since the index was built', () => {
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'fixture',
        private: true,
        scripts: { postinstall: 'node generate.js' },
      }),
    )
    install()
    run()
    manifest()

    const found = (run(true, true).measured ?? []).find(
      (one) => one.signal === 'postinstall',
    )
    expect(found?.indexed).toBe('an install script')
    expect(found?.measured).toBe('none')
  })

  it('sees a config that globs files where it globbed none before', () => {
    // Analysed with nothing to glob — which is `missing-generated` — and
    // measured after something wrote the files.
    rmSync(join(root, 'src'), { recursive: true })
    install()
    run()
    write('src/app.ts')

    const found = (run(true, true).measured ?? []).find(
      (one) => one.signal === 'globbed',
    )
    expect(found?.indexed).toBe('its config globbed nothing')
    expect(found?.measured).toBe('it globs 1 file(s)')
  })

  it('sees a config that globbed files and now globs none', () => {
    install()
    run()
    rmSync(join(root, 'src'), { recursive: true })

    const found = (run(true, true).measured ?? []).find(
      (one) => one.signal === 'globbed',
    )
    expect(found?.indexed).toBe('its config globbed files')
    expect(found?.measured).toBe('it globs nothing')
  })

  it('reports the fingerprint last, because it is the sum of the others', () => {
    install()
    run()
    rmSync(join(root, 'node_modules'), { recursive: true })
    expect(signals().at(-1)).toBe('fingerprint')
  })

  it('orders disagreements by project, then by signal', () => {
    // Two projects, so the comparison that decides the order is the path rather
    // than the signal.
    write('apps/web/src/app.ts', 'export const app = 1\n')
    writeFileSync(
      join(root, 'apps', 'web', 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { target: 'ES2022', module: 'ESNext', noEmit: true },
        include: ['src'],
      }),
    )
    install()
    run()
    rmSync(join(root, 'node_modules'), { recursive: true })

    const measured = run(true, true).measured ?? []
    const projects = measured.map((one) => one.project)
    expect([...projects].sort()).toEqual(projects)
    expect(new Set(projects).size).toBe(2)
  })
})
