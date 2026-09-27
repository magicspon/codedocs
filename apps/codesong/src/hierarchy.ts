/**
 * The repository's subsystems: the directories that divide it into a handful
 * of large parts. They become the sections of the piece, so they are found
 * from the file counts, not from a list of names, and any repository gets
 * its own.
 */

/** One subsystem: a directory and the files under it. */
export interface Subsystem {
  /** Directory path, `''` for the repository root. */
  readonly path: string
  /** A short display name: the directory's last segment. */
  readonly name: string
  /** Node indexes of the files it holds. */
  readonly files: readonly number[]
}

/** Most subsystems to divide into; more would make sections too short to hear. */
const MAX_SUBSYSTEMS = 7
/** A directory holding this share of its parent's files is the parent, one level down. */
const DOMINANT = 0.8
/** Directories smaller than this share of the repository are not subsystems. */
const MIN_SHARE = 0.03

interface Group {
  path: string
  files: number[]
}

/** The files of `group` by the next directory segment below it. */
function children(group: Group, paths: readonly string[]): Group[] {
  const depth = group.path === '' ? 0 : group.path.split('/').length
  const byChild = new Map<string, number[]>()
  for (const i of group.files) {
    const segments = paths[i]!.split('/')
    // A file directly in this directory stays with it.
    const child =
      segments.length - 1 > depth
        ? segments.slice(0, depth + 1).join('/')
        : group.path
    const list = byChild.get(child) ?? []
    list.push(i)
    byChild.set(child, list)
  }
  return [...byChild].map(([path, files]) => ({ path, files }))
}

/** Walks down through directories that hold nearly all of a group's files. */
function compress(group: Group, paths: readonly string[]): Group {
  let current = group
  for (;;) {
    const kids = children(current, paths)
    const biggest = kids.reduce((a, b) =>
      b.files.length > a.files.length ? b : a,
    )
    if (
      biggest.path === current.path ||
      biggest.files.length < current.files.length * DOMINANT
    ) {
      return current
    }
    current = biggest
  }
}

/** Directory names that say where code lives, not what it is. */
const GENERIC = new Set([
  'src',
  'lib',
  'source',
  'sources',
  'packages',
  'app',
  'apps',
  'vs',
])

/**
 * The last directory name that says what the code is, so
 * `packages/ui/src` is `ui` rather than one of several `src` sections.
 */
export function displayName(path: string): string {
  const segments = path.split('/').filter(Boolean)
  const telling = [...segments].reverse().find((s) => !GENERIC.has(s))
  return telling ?? segments.at(-1) ?? 'root'
}

/** Once no group holds more than this share of the files, the split is balanced enough. */
const BALANCED = 0.25

/**
 * Replaces `group` with its biggest child directories, as many as `room`
 * allows, plus a remainder under the group's own path holding its loose files
 * and smaller children. Returns nothing when fewer than two children qualify.
 */
function split(
  group: Group,
  paths: readonly string[],
  room: number,
  minimum: number,
): Group[] {
  const kids = children(group, paths)
    .filter((g) => g.path !== group.path && g.files.length >= minimum)
    .sort(
      (a, b) => b.files.length - a.files.length || a.path.localeCompare(b.path),
    )
    .slice(0, room - 1)
  if (kids.length < 2) return []
  const taken = new Set(kids.flatMap((g) => g.files))
  const rest = group.files.filter((i) => !taken.has(i))
  const parts = kids.map((g) => compress(g, paths))
  return rest.length >= minimum
    ? [...parts, { path: group.path, files: rest }]
    : parts
}

/**
 * Splits the largest group until the groups are balanced, there are
 * `MAX_SUBSYSTEMS`, or the largest cannot split. Directories too small to be
 * a subsystem are left out; their files still shape the global analysis.
 */
export function subsystems(paths: readonly string[]): Subsystem[] {
  const total = paths.length
  if (total === 0) return []
  const minimum = Math.max(1, Math.ceil(total * MIN_SHARE))
  let groups: Group[] = [
    compress({ path: '', files: paths.map((_, i) => i) }, paths),
  ]
  for (;;) {
    const largest = groups.reduce((a, b) =>
      b.files.length > a.files.length ? b : a,
    )
    if (largest.files.length <= total * BALANCED) break
    const others = groups.filter((g) => g !== largest)
    const parts = split(largest, paths, MAX_SUBSYSTEMS - others.length, minimum)
    if (parts.length === 0) break
    groups = [...others, ...parts]
  }
  return groups
    .filter((g) => g.files.length >= minimum)
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((g) => ({
      path: g.path,
      name: displayName(g.path),
      files: g.files,
    }))
}
