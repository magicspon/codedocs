import { symbolCount, type FileDatum } from './atlas.ts'
import { hash, rng } from './rng.ts'

/**
 * The directory tree laid out radially, for the terrain: the repository root
 * sits at the centre and each folder fans out from its parent, so the
 * rivers that follow the tree branch like a delta or a mycelium.
 *
 * Each depth gets a ring, spaced a little closer towards the centre (radius
 * grows as depth to the power `RING_POWER`). The inner rings hold few
 * folders, so evenly spaced rings would leave the middle an empty crater.
 */

/** One folder or file, placed. */
export interface TreeNode {
  /** Index of the parent node, or `-1` for the root. */
  readonly parent: number
  /** Steps from the root; the root is `0`. */
  readonly depth: number
  /** Index into the series' files, or `-1` for a folder. */
  readonly file: number
  /** Which top-level branch the node grows from, or `-1` for the root. */
  readonly branch: number
  /** Where it stands on the ground plane. */
  readonly x: number
  readonly z: number
  /** Its angle round the centre and its distance from it. */
  readonly angle: number
  readonly radius: number
}

/** The whole tree, placed. */
export interface RadialTree {
  /** Root first; every parent comes before its children. */
  readonly nodes: readonly TreeNode[]
  /** Per file, its node index. */
  readonly fileNode: readonly number[]
  /** How many top-level branches fan out from the root. */
  readonly branches: number
  /** Distance from the centre to the outermost ring. */
  readonly radius: number
}

interface Draft {
  readonly name: string
  readonly folders: Map<string, Draft>
  readonly files: number[]
  weight: number
}

/** How ring radius grows with depth; above `1` draws the inner rings in. */
const RING_POWER = 1.15

/** A share of each span left empty on both sides, so neighbouring ranges part. */
const GAP = 0.06

function draft(name: string): Draft {
  return { name, folders: new Map(), files: [], weight: 0 }
}

/** A file's claim on the circle: big files get more, but not in proportion. */
function fileWeight(file: FileDatum): number {
  return 1 + Math.sqrt(symbolCount(file))
}

/** Sorts every file into its folder and totals each folder's weight. */
function grow(files: readonly FileDatum[]): Draft {
  const root = draft('')
  files.forEach((f, i) => {
    const parts = f.path.split('/')
    let at = root
    for (const part of parts.slice(0, -1)) {
      let next = at.folders.get(part)
      if (!next) at.folders.set(part, (next = draft(part)))
      at = next
    }
    at.files.push(i)
  })
  const total = (d: Draft): number => {
    d.weight = d.files.reduce((s, i) => s + fileWeight(files[i]!), 0)
    for (const child of d.folders.values()) d.weight += total(child)
    return d.weight
  }
  total(root)
  return root
}

/**
 * Folds away folders that hold nothing but one other folder, such as a lone
 * `src/`: they add a ring and no branching, which would push the picture out.
 */
function collapse(d: Draft): Draft {
  for (const [key, child] of d.folders) d.folders.set(key, collapse(child))
  if (d.files.length === 0 && d.folders.size === 1) {
    const only = [...d.folders.values()][0]!
    return { ...only, name: `${d.name}/${only.name}` }
  }
  return d
}

/** Deepest file, counting the file itself as one step below its folder. */
function depthOf(d: Draft, depth: number): number {
  let deepest = d.files.length > 0 ? depth + 1 : depth
  for (const child of d.folders.values())
    deepest = Math.max(deepest, depthOf(child, depth + 1))
  return deepest
}

/**
 * Lays the tree of `files` out on a disc of `radius`. Deterministic: the same
 * files always land in the same places.
 */
export function radialTree(
  files: readonly FileDatum[],
  radius: number,
): RadialTree {
  const root = collapse(grow(files))
  const deepest = Math.max(1, depthOf(root, 0))
  const ring = (depth: number): number =>
    radius * Math.pow(depth / deepest, RING_POWER)
  const nodes: TreeNode[] = []
  const fileNode = Array.from({ length: files.length }, () => -1)
  const place = (
    parent: number,
    depth: number,
    file: number,
    branch: number,
    angle: number,
    r: number,
  ): number => {
    nodes.push({
      parent,
      depth,
      file,
      branch,
      angle,
      radius: r,
      x: Math.cos(angle) * r,
      z: Math.sin(angle) * r,
    })
    return nodes.length - 1
  }

  const visit = (
    d: Draft,
    self: number,
    depth: number,
    branch: number,
    from: number,
    span: number,
  ): void => {
    // Files first, then folders, each by name, so the layout is stable.
    const folders = [...d.folders.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    )
    const own = [...d.files].sort((a, b) =>
      files[a]!.path.localeCompare(files[b]!.path),
    )
    let at = from
    const share = (weight: number): [number, number] => {
      const width = (span * weight) / Math.max(d.weight, 1e-9)
      const start = at
      at += width
      return [start + width * GAP, width * (1 - 2 * GAP)]
    }
    for (const i of own) {
      const [start, width] = share(fileWeight(files[i]!))
      // Scattered through the ring beyond the folder, so a folder of many
      // files spreads into a range instead of lining up on one arc.
      const random = rng(hash(files[i]!.path))
      const angle = start + width * (0.2 + 0.6 * random())
      const r = ring(depth + 0.3 + 0.7 * random())
      fileNode[i] = place(self, depth + 1, i, branch, angle, r)
    }
    folders.forEach((child, k) => {
      const [start, width] = share(child.weight)
      const angle = start + width / 2
      const b = depth === 0 ? k : branch
      const node = place(self, depth + 1, -1, b, angle, ring(depth + 1))
      visit(child, node, depth + 1, b, start, width)
    })
  }

  const top = place(-1, 0, -1, -1, 0, 0)
  // Loose files at the root join no branch of their own; they share the last.
  visit(root, top, 0, -1, 0, Math.PI * 2)
  const branches = root.folders.size
  for (const i of fileNode) {
    const n = nodes[i]!
    if (n.branch === -1) nodes[i] = { ...n, branch: Math.max(0, branches - 1) }
  }
  return { nodes, fileNode, branches: Math.max(1, branches), radius }
}
