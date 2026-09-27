/**
 * Readies the extension project on this machine.
 *
 *     npm run setup        (from apps/codesong/live)
 *
 * Ableton's SDK licence treats the SDK as confidential, so it is never
 * committed. This copies it from the SDK download into `vendor/`, which git
 * ignores, finds a Live that can run extensions, and installs.
 *
 * `ABLETON_EXTENSIONS_SDK` names the unzipped SDK folder; the default is where
 * it was first unzipped.
 */

import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const here = import.meta.dirname
const sdk =
  process.env.ABLETON_EXTENSIONS_SDK ??
  join(homedir(), 'Desktop', 'extensions-sdk-1.0.0-beta.1')

function fail(message: string): never {
  console.error(`✗ ${message}`)
  process.exit(1)
}

if (!existsSync(sdk)) {
  fail(
    `no SDK at ${sdk}; set ABLETON_EXTENSIONS_SDK to the unzipped SDK folder`,
  )
}

// Copied under fixed names so package.json never names an SDK version.
const vendor = join(here, 'vendor')
mkdirSync(vendor, { recursive: true })
for (const [prefix, name] of [
  ['ableton-extensions-sdk-', 'sdk.tgz'],
  ['ableton-extensions-cli-', 'cli.tgz'],
] as const) {
  const tgz = readdirSync(sdk).find(
    (f) => f.startsWith(prefix) && f.endsWith('.tgz'),
  )
  if (tgz === undefined) fail(`no ${prefix}*.tgz in ${sdk}`)
  copyFileSync(join(sdk, tgz), join(vendor, name))
  console.log(`✓ ${tgz}`)
}

// The CLI reads EXTENSION_HOST_PATH from .env; only a Live with an extension
// host can run the extension, which today means the 12.4 beta.
const env = join(here, '.env')
if (!existsSync(env)) {
  const live = readdirSync('/Applications')
    .filter((a) => a.startsWith('Ableton Live') && a.endsWith('.app'))
    .map((a) => join('/Applications', a))
    .find((a) =>
      existsSync(
        join(a, 'Contents/Helpers/ExtensionHost/ExtensionHostNodeModule.node'),
      ),
    )
  if (live === undefined) {
    console.warn(
      '! no Ableton Live with extension support in /Applications; install the Live beta, then run setup again',
    )
  } else {
    writeFileSync(env, `EXTENSION_HOST_PATH=${live}\n`)
    console.log(`✓ ${live}`)
  }
}

const npm = spawnSync('npm', ['install'], { cwd: here, stdio: 'inherit' })
process.exit(npm.status ?? 1)
