/**
 * Finds the palette's drum samples in Live's Core Library. Runs in the
 * compose script, not in Live: an extension may only read its own storage and
 * temp folders, so it cannot search the library itself. It imports each path
 * this module found into the project instead.
 */

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { DrumSample, Palette } from './palette.ts'

/** The drums folder inside a Live app bundle. */
const DRUMS = [
  'Contents',
  'App-Resources',
  'Core Library',
  'Samples',
  'One Shots',
  'Drums',
]

/** Where macOS installs Live. */
const APPLICATIONS = '/Applications'

/**
 * Every Live install's drums folder, newest name first, so the 12.4 beta the
 * SDK needs wins over an older Live beside it.
 */
export function drumFolders(applications: string = APPLICATIONS): string[] {
  if (!existsSync(applications)) return []
  return readdirSync(applications)
    .filter((name) => name.startsWith('Ableton Live') && name.endsWith('.app'))
    .sort()
    .reverse()
    .map((app) => join(applications, app, ...DRUMS))
    .filter((dir) => existsSync(dir))
}

/** Audio files only: Live keeps an `.asd` analysis file beside each sample. */
const AUDIO = /\.(aif|aiff|wav|flac)$/i

function find(drums: string, sample: DrumSample): string | undefined {
  const folder = join(drums, sample.folder)
  if (!existsSync(folder)) return undefined
  if (existsSync(join(folder, sample.file))) return join(folder, sample.file)
  const fallback = readdirSync(folder)
    .filter((f) => AUDIO.test(f) && f.startsWith(sample.prefix))
    .sort()[0]
  return fallback === undefined ? undefined : join(folder, fallback)
}

/**
 * An absolute sample path per drum voice. A voice with no sample in any
 * install is left out, and its pad stays silent rather than borrowing one.
 */
export function findKit(
  palette: Palette,
  folders: readonly string[] = drumFolders(),
): Record<string, string> {
  const kit: Record<string, string> = {}
  for (const [voice, sample] of Object.entries(palette.kit)) {
    for (const drums of folders) {
      const path = find(drums, sample)
      if (path === undefined) continue
      kit[voice] = path
      break
    }
  }
  return kit
}
