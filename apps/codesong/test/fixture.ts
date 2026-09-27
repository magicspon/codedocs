/**
 * A small hand-made atlas: an app entry that fans out through a service layer
 * to a shared model, plus a test and a generated file the composer must skip.
 */

import type { Atlas, FileDatum } from '@codedocs/code-art/atlas'

function file(path: string, extra: Partial<FileDatum> = {}): FileDatum {
  return {
    path,
    size: 100,
    kinds: [1, 0, 0, 0, 0, 0, 0, 0],
    role: 0,
    generated: false,
    project: 0,
    callsIn: 0,
    callsOut: 0,
    callsSelf: 0,
    refsIn: 0,
    unresolved: 0,
    ...extra,
  }
}

/** Files by index: 0 main, 1 router, 2 users, 3 orders, 4 db, 5 model, 6 log, 7 test, 8 generated. */
export const atlas: Atlas = {
  name: 'fixture',
  commit: 'abc123',
  analysedAt: '2026-09-27',
  projects: ['tsconfig.json'],
  files: [
    file('src/main.ts'),
    file('src/router.ts'),
    file('src/users.ts'),
    file('src/orders.ts'),
    file('src/db.ts'),
    file('src/model.ts'),
    file('src/log.ts'),
    file('src/users.test.ts', { role: 1 }),
    file('src/schema.gen.ts', { generated: true }),
  ],
  calls: [
    [0, 1, 4],
    [1, 2, 3],
    [1, 3, 2],
    [2, 4, 5],
    [3, 4, 2],
    [4, 5, 6],
    [2, 6, 1],
    [3, 6, 1],
    [7, 2, 9],
    [8, 5, 9],
  ],
  imports: [
    [0, 6, 1],
    [2, 5, 1],
    [3, 5, 1],
  ],
}
