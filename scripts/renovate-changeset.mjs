// Records a change intent for a Renovate update that a consumer would feel.
//
// Renovate does not run `pnpm update` — it rewrites the range in package.json
// itself and then refreshes the lockfile. So `pnpm update --changeset` ran
// after the fact with nothing left to do, and always reported "No changeset was
// generated because the update did not change the production or peer
// dependencies of any workspace package". That flag writes a changeset for the
// bumps *its own run* makes; there is no such run here.
//
// This script supplies the two things Renovate's update leaves implicit —
// whether the change is releasable, and which package owns it — and then hands
// the writing to `pnpm change`, so the changesets format stays pnpm's problem.
//
// Invoked once per upgrade by renovate.json's postUpgradeTasks, with the
// templated fields of that upgrade:
//
//   node scripts/renovate-changeset.mjs <packageFile> <depType> <depName>
//
// Runs in the Renovate container, which has no node_modules — hence the
// standard library plus `pnpm change`, both of which work without an install.

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * Dep types that form part of a published package's install contract.
 * Everything else — devDependencies, the root manifest, github-actions, the
 * example app — changes nothing a consumer installs, so it gets no changeset.
 */
const RELEASABLE_DEP_TYPES = new Set(['dependencies', 'peerDependencies'])

const skip = (reason) => {
  console.log(`renovate-changeset: ${reason}; no changeset needed`)
  process.exit(0)
}

const [packageFile, depType, depName] = process.argv.slice(2)

if (!packageFile || !depType || !depName) {
  console.error(
    'usage: renovate-changeset.mjs <packageFile> <depType> <depName>',
  )
  process.exit(1)
}

if (!RELEASABLE_DEP_TYPES.has(depType)) skip(`${depName} is a ${depType}`)

/** @type {{ name?: string, private?: boolean } & Record<string, unknown>} */
let manifest
try {
  manifest = JSON.parse(
    readFileSync(resolve(process.cwd(), packageFile), 'utf8'),
  )
} catch (error) {
  // A manager other than npm can hand us a path that is not a manifest at all.
  skip(`cannot read ${packageFile} as a manifest (${error.message})`)
}

if (!manifest.name || manifest.private) {
  skip(`${packageFile} is private or unnamed`)
}

const newRange = manifest[depType]?.[depName]
if (typeof newRange !== 'string') {
  // Renovate named a dep this manifest no longer declares — a stale branch, or
  // a dep that moved between types. Nothing to describe.
  skip(`${depName} not found in ${packageFile} ${depType}`)
}

const kind = depType === 'peerDependencies' ? 'peer range' : 'dependency'
const summary = `Update \`${depName}\` ${kind} to \`${newRange}\`.`

// `pnpm change` picks a random filename, so re-running on the same branch would
// otherwise leave a second intent saying the same thing. Two patch intents
// still produce one patch bump, but the changelog would repeat itself.
const changesetDir = join(process.cwd(), '.changeset')
const alreadyRecorded = readdirSync(changesetDir)
  .filter((entry) => entry.endsWith('.md') && entry !== 'README.md')
  .some((entry) => {
    const existing = readFileSync(join(changesetDir, entry), 'utf8')
    return (
      existing.includes(summary) && existing.includes(`"${manifest.name}":`)
    )
  })

if (alreadyRecorded) skip(`${summary} is already recorded`)

// Patch, matching what `pnpm update --changeset` writes for a dependency bump.
// The packages are `linked`, so one patch here moves them all in step.
execFileSync(
  'pnpm',
  ['change', '--bump', 'patch', '--summary', summary, manifest.name],
  { stdio: 'inherit' },
)
