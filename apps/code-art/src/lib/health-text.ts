import type { FallowMeta, FileHealth, FileScore } from './atlas.ts'

/**
 * fallow's readings in words, for the file panel and the lens legend. Kept
 * apart from the components so the wording is tested.
 */

/** fallow's trend numbers, in words. */
const TRENDS: Record<number, string> = {
  [-1]: 'cooling',
  0: 'stable',
  1: 'heating up',
}

/** What the health lens draws in each scene, one sentence per reading. */
const LENS: Record<string, { hot: string; unused: string; rest: string }> = {
  galaxy: {
    hot: 'Hotspots flare, from orange to white as they get hotter. A pulsing one is heating up; a dull red one is cooling.',
    unused: 'Grey stars are files no entry point reaches.',
    rest: 'Pale blue threads join files that share copied code.',
  },
  city: {
    hot: 'A pillar of warning light marks a hotspot settlement: taller and redder is hotter, and its buildings flush red. A pulse climbing the pillar means heating up; a low grey one means cooling.',
    unused:
      'Unlit, concrete-grey settlements are files no entry point reaches.',
    rest: 'Rust shows code that is hard to change, and the air thickens with smog as the whole repository does.',
  },
}

/** A label and its value, one row of the file panel. */
export type Row = readonly [string, string]

function scoreRows(score: FileScore | undefined): Row[] {
  if (!score) return [['Maintainability', 'not measured']]
  return [
    ['Maintainability', `${score.maintainability} / 100`],
    ['Complexity', `${score.cyclomatic} paths, ${score.cognitive} cognitive`],
  ]
}

function hotspotRow(health: FileHealth): Row {
  if (health.hotspot <= 0) return ['Hotspot', 'no']
  const trend = TRENDS[health.trend] ?? 'stable'
  return [
    'Hotspot',
    `${health.hotspot} / 100, ${trend}, ${health.commits} commits`,
  ]
}

/** Unused-code rows, only where fallow trusted its dead-code findings. */
function deadRows(health: FileHealth, fallow: FallowMeta): Row[] {
  if (!fallow.deadCode) return []
  return [
    ['Unused file', health.unused ? 'yes' : 'no'],
    ['Unused exports', String(health.unusedExports ?? 0)],
  ]
}

/** One file's fallow reading as panel rows. */
export function healthRows(health: FileHealth, fallow: FallowMeta): Row[] {
  return [
    ...scoreRows(health.score),
    hotspotRow(health),
    ['Copied lines', String(health.duplicated)],
    ...(health.cyclic ? [['Import cycle', 'yes'] as const] : []),
    ...deadRows(health, fallow),
  ]
}

/**
 * What the lens shows in `scene`, in words. Says so when unused files are left
 * out, so a repo with no dark towers is not mistaken for one with no dead code.
 */
export function lensLegend(scene: string, fallow: FallowMeta): string {
  const lens = LENS[scene]
  if (!lens) return ''
  const unused = fallow.deadCode
    ? lens.unused
    : 'Unused files are not shown, because the repo has no fallow config.'
  return `${lens.hot} ${unused} ${lens.rest}`
}

/**
 * The line under the lens toggle: how to get readings where there are none,
 * what the lens shows while it is on, and nothing while it is off.
 */
export function lensNote(
  scene: string,
  fallow: FallowMeta | undefined,
  on: boolean,
): string {
  if (!fallow)
    return 'No health readings. Export again with fallow on your PATH.'
  return on ? lensLegend(scene, fallow) : ''
}
