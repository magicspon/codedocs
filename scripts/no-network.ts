/**
 * The invariant behind PRD §28 and ADR 0011: no codedocs package reaches the
 * network. `report-bug` writes bytes and stops; the user moves them.
 *
 * Two halves, because two different things break it:
 *
 * - **First-party source** belongs to oxlint, via `no-restricted-imports` and
 *   `no-restricted-globals` in `.oxlintrc.json`. It has an AST, so it reports a
 *   line and ignores a module name that only appears in a comment.
 * - **The production dependency closure** belongs to this file. No linter can
 *   see it: the code that would reach the network sits in `node_modules`, and
 *   the import that pulls it in is a version range in a manifest.
 *
 * The check is nearly free today — one runtime dependency, `typescript`, whose
 * shipped JavaScript is two shims around a Go binary — and it is worth nothing
 * as prose the moment someone adds an HTTP client for an unrelated reason.
 *
 *     node scripts/no-network.ts
 *
 * Exits 0 when the closure is clean and 1 when it is not. It is syntactic, like
 * `fallow`: the job is to make an accidental dependency loud, not to defeat a
 * determined one.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * The built-in modules that carry traffic off the machine.
 *
 * `child_process` is deliberately absent — `report-bug` re-runs a command, so
 * spawning is the operation, not the leak.
 */
const NETWORK_MODULES: readonly string[] = [
  'http',
  'https',
  'http2',
  'net',
  'tls',
  'dgram',
  'dns',
]

/** Files worth reading inside a dependency. Everything else is data. */
const CODE_EXTENSIONS: readonly string[] = [
  '.js',
  '.cjs',
  '.mjs',
  '.ts',
  '.cts',
  '.mts',
]

/**
 * A declaration file declares; it never runs. Reading them would flag every
 * package that ships `lib.dom.d.ts`, which is a fact about the DOM rather than
 * about what codedocs does.
 */
const DECLARATION = /\.d\.[cm]?ts$/

/**
 * What reaching the network looks like in shipped JavaScript, minified or not.
 *
 * A dependency's code is read as text rather than parsed: bundles are one line,
 * and the question is only whether the capability is present at all.
 */
const PATTERNS: readonly RegExp[] = [
  // The specifier in every position a module arrives by: `import x from "net"`,
  // `import "node:net"`, `import("node:dns")`, `require("http")`.
  new RegExp(
    `(?:from|import|require)\\s*\\(?\\s*['"\`](?:node:)?(?:${NETWORK_MODULES.join('|')})['"\`]`,
    'g',
  ),
  // `fetch()` as a global. `client.fetch()` is somebody else's API, and the
  // character before the name is all that separates the two.
  /(?<![.\w$])fetch\s*\(/g,
  /(?:globalThis|window|self|global)\s*\.\s*fetch\b/g,
  /(?<![.\w$])(?:XMLHttpRequest|WebSocket|EventSource)\b/g,
  /\bsendBeacon\s*\(/g,
]

/**
 * Uses that have been read and found to be local.
 *
 * A row exempts one module inside one package, never the package outright: a
 * dependency allowed a unix socket is not thereby allowed `fetch`. Writing a
 * row down is the deliberate act the check exists to force, and the reason is
 * the part that has to survive review.
 */
const ALLOWED: readonly {
  readonly dependency: string
  readonly module: string
  readonly reason: string
}[] = [
  {
    dependency: 'typescript',
    module: 'net',
    reason:
      "The async API's `connectViaSocket` opens a named pipe to the local " +
      '`tsgo` process, and the vendored vscode-jsonrpc carries that same ' +
      'connection. Neither is reachable from `typescript/unstable/sync`, ' +
      'which is the only entry point the adapter imports.',
  },
]

/** One place in one file where the network is within reach. */
export interface NetworkUse {
  /** Path to the file, relative to the package that ships it. */
  readonly file: string
  /** 1-based line number. */
  readonly line: number
  /** The matched text, trimmed to something readable in a terminal. */
  readonly evidence: string
}

/** A dependency that reaches the network, and how codedocs arrives at it. */
export interface NetworkReach {
  /** The dependency, as `name@version`. */
  readonly dependency: string
  /** Absolute path to the installed package. */
  readonly path: string
  /** The dependency path from a workspace package down to this one. */
  readonly chain: readonly string[]
  /** Every use found, in file order. */
  readonly uses: readonly NetworkUse[]
}

/** The whole answer: what reaches the network, and what could not be read. */
export interface NetworkAudit {
  /** Every dependency found to reach the network, by name. */
  readonly reach: readonly NetworkReach[]
  /** Packages `pnpm list` names but this platform has not installed. */
  readonly unread: readonly string[]
}

/** How many lines a report section prints before summarising the rest. */
const EVIDENCE_SHOWN = 5

/**
 * Every network use in one file's text.
 *
 * Exported so a test can plant a violation and prove the matcher still fires: a
 * check that has never failed is indistinguishable from one that cannot.
 */
export function findNetworkUses(source: string, file: string): NetworkUse[] {
  const uses: NetworkUse[] = []

  for (const pattern of PATTERNS) {
    // Each call gets its own iterator; the literals above are shared state.
    for (const match of source.matchAll(new RegExp(pattern.source, 'g'))) {
      const before = source.slice(0, match.index)
      uses.push({
        file,
        line: before.split('\n').length,
        evidence: match[0].trim(),
      })
    }
  }

  return uses.sort((a, b) => a.line - b.line)
}

/** Every code file in a package, ignoring the packages nested inside it. */
function codeFilesIn(directory: string, prefix = ''): string[] {
  const files: string[] = []

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      files.push(...codeFilesIn(join(directory, entry.name), relativePath))
      continue
    }

    if (DECLARATION.test(entry.name)) continue
    if (CODE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
      files.push(relativePath)
    }
  }

  return files
}

/** Every network use across one installed package. */
export function scanPackage(directory: string): NetworkUse[] {
  return codeFilesIn(directory).flatMap((file) =>
    findNetworkUses(readFileSync(join(directory, file), 'utf8'), file),
  )
}

/** One third-party package in the closure, as this check needs to see it. */
interface InstalledPackage {
  /** The package name, without the version. */
  readonly name: string
  /** Absolute path to the installed directory. */
  readonly path: string
  /** The dependency path from a workspace package down to it. */
  readonly chain: readonly string[]
}

/** A node of `pnpm list --json`, narrowed to the fields this check reads. */
interface ListedPackage {
  readonly version?: string
  readonly path?: string
  readonly dependencies?: Record<string, ListedPackage>
  readonly optionalDependencies?: Record<string, ListedPackage>
}

/**
 * Every third-party package the workspace's runtime dependencies resolve to.
 *
 * `pnpm list` rather than a walk of `node_modules`, because pnpm's store is a
 * symlink farm and only pnpm knows which of it is production: the answer wanted
 * here is what ships, not what is installed.
 */
export function productionClosure(root: string): Map<string, InstalledPackage> {
  const output = execFileSync(
    'pnpm',
    ['list', '--recursive', '--prod', '--depth', 'Infinity', '--json'],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )

  const found = new Map<string, InstalledPackage>()
  // A dependency graph may be cyclic, and `pnpm list` prints it as a tree.
  const seen = new Set<string>()

  const visit = (node: ListedPackage, chain: readonly string[]): void => {
    const children = { ...node.dependencies, ...node.optionalDependencies }

    for (const [name, child] of Object.entries(children)) {
      const key = `${name}@${child.version ?? 'unknown'}`
      if (seen.has(key)) continue
      seen.add(key)

      const next = [...chain, name]
      // pnpm spells a workspace link `link:../core`. That code is first-party,
      // and oxlint reads it; everything else is somebody else's.
      if (
        child.path !== undefined &&
        child.version?.startsWith('link:') !== true
      ) {
        found.set(key, { name, path: child.path, chain: next })
      }

      visit(child, next)
    }
  }

  for (const workspacePackage of JSON.parse(output) as ListedPackage[]) {
    visit(workspacePackage, [])
  }

  return found
}

/**
 * Whether one use is a row in `ALLOWED`.
 *
 * Exported so a test can hold the exemption to its stated scope: `typescript`
 * is allowed a socket, not a licence.
 */
export function isAllowed(dependency: string, use: NetworkUse): boolean {
  return ALLOWED.some(
    (allowance) =>
      allowance.dependency === dependency &&
      // `node:net` and `net` are the same module, and `network` is not.
      new RegExp(`(?:node:)?${allowance.module}\\b`).test(use.evidence),
  )
}

/**
 * Every dependency of codedocs that can reach the network.
 *
 * A package `pnpm list` names but this platform has not installed — an optional
 * platform binary belonging to another OS — is recorded as unread rather than
 * passed over. No single machine reads the whole closure, and saying so is
 * cheaper than a check that quietly reads less than it claims.
 */
export function audit(root: string): NetworkAudit {
  const reach: NetworkReach[] = []
  const unread: string[] = []

  for (const [dependency, { name, path, chain }] of productionClosure(root)) {
    if (!existsSync(path)) {
      unread.push(dependency)
      continue
    }

    const uses = scanPackage(path).filter((use) => !isAllowed(name, use))
    if (uses.length > 0) reach.push({ dependency, path, chain, uses })
  }

  return {
    reach: reach.sort((a, b) => a.dependency.localeCompare(b.dependency)),
    unread: unread.sort(),
  }
}

/**
 * At most `EVIDENCE_SHOWN` lines, then a count of what was left out.
 *
 * A minified bundle can match hundreds of times, and the hundredth match tells
 * a reader nothing the first did not.
 */
function capped(indent: string, items: readonly string[]): string[] {
  const shown = items.slice(0, EVIDENCE_SHOWN).map((item) => indent + item)
  if (items.length <= EVIDENCE_SHOWN) return shown

  return [...shown, `${indent}\u2026and ${items.length - EVIDENCE_SHOWN} more`]
}

/** What reaches the network, named rather than counted. */
function reachLines(reach: readonly NetworkReach[]): string[] {
  if (reach.length === 0) return ['No codedocs package reaches the network.']

  const verb = reach.length === 1 ? 'dependency reaches' : 'dependencies reach'
  const lines = [`${reach.length} runtime ${verb} the network:`, '']

  for (const entry of reach) {
    lines.push(
      `  ${entry.dependency}  via ${entry.chain.join(' \u2192 ')}`,
      ...capped(
        '    ',
        entry.uses.map((use) => `${use.file}:${use.line}  ${use.evidence}`),
      ),
      '',
    )
  }

  lines.push(
    'ADR 0011: data never leaves the machine, and this check is what forbids it',
    "rather than anyone's memory. Drop the dependency, or amend the ADR first.",
  )

  return lines
}

/** What this platform could not read, so the pass is not mistaken for a proof. */
function unreadLines(unread: readonly string[]): string[] {
  if (unread.length === 0) return []

  return [
    '',
    `Not read: ${unread.length} optional packages this platform does not install.`,
    ...capped('  ', unread),
  ]
}

/** The report, in the shape ADR 0011 asks the invariant to be readable in. */
export function report(result: NetworkAudit): string {
  return [...reachLines(result.reach), ...unreadLines(result.unread)].join('\n')
}

// Run only when invoked directly; the test imports the functions above.
if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === import.meta.filename
) {
  const result = audit(resolve(import.meta.dirname, '..'))
  console.log(report(result))
  process.exitCode = result.reach.length === 0 ? 0 : 1
}
