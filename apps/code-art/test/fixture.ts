import type { Atlas, FileDatum } from '../src/lib/atlas.ts'

/** A file with sensible zeros, overridden where a test cares. */
export function file(path: string, over: Partial<FileDatum> = {}): FileDatum {
  return {
    path,
    size: 1000,
    kinds: [1, 0, 0, 0, 0, 0, 0, 0],
    role: 0,
    generated: false,
    project: 0,
    callsIn: 0,
    callsOut: 0,
    callsSelf: 0,
    refsIn: 0,
    unresolved: 0,
    ...over,
  }
}

/** A small repository: three top-level folders, one hub, one blind file. */
export function atlas(): Atlas {
  return {
    name: 'fixture',
    commit: 'abc',
    analysedAt: '',
    projects: ['tsconfig.json'],
    files: [
      file('a/hub.ts', { callsIn: 40, kinds: [5, 1, 0, 0, 0, 2, 0, 0] }),
      file('a/leaf.ts', { unresolved: 9 }),
      file('b/one.ts', { role: 1, size: 4000 }),
      file('b/deep/two.ts', { generated: true }),
      file('c/three.ts', { kinds: [0, 0, 0, 0, 0, 0, 0, 0] }),
    ],
    calls: [
      [1, 0, 30],
      [2, 0, 10],
    ],
    imports: [
      [1, 0, 1],
      [3, 2, 1],
    ],
  }
}
