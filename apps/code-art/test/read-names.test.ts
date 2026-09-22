import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, describe, expect, it } from 'vitest'
import { readNames } from '../scripts/read-names.ts'

const dir = mkdtempSync(join(tmpdir(), 'code-art-names-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

/** The three tables the reader touches, in the store's shape. */
function index(): string {
  const path = join(dir, 'index.db')
  const db = new DatabaseSync(path)
  db.exec(`
    create table path (id integer primary key, path text);
    create table node (id integer primary key, path_id integer, descriptors text);
    create table symbol (node_id integer, path_id integer, kind integer, name text, start integer);
    insert into path values (1, 'src/a.ts'), (2, '../outside.ts');
    insert into node values
      (1, 1, 'second().'), (2, 1, 'first().'), (3, 1, 'Thing#'),
      (4, 1, 'Thing#run().'), (5, 1, 'Thing#run().step.'),
      (6, 1, 'Thinger#'), (7, 1, 'it(\`works\`).local.'), (8, 2, 'skip().');
    insert into symbol values
      (1, 1, 0, 'second', 50), (2, 1, 0, 'first', 10), (3, 1, 1, 'Thing', 30),
      (4, 1, 6, 'run', 32), (5, 1, 5, 'step', 34), (6, 1, 1, 'Thinger', 60),
      (7, 1, 5, 'local', 70), (8, 2, 0, 'skip', 0);
  `)
  db.close()
  return path
}

describe('readNames', () => {
  const names = readNames(index())
  const a = names['src/a.ts']!

  it('lists names and kinds in source order', () => {
    expect(a.names).toEqual([
      'first',
      'Thing',
      'run',
      'step',
      'second',
      'Thinger',
      'local',
    ])
    expect(a.kinds).toEqual([0, 1, 6, 5, 0, 1, 5])
  })

  it('points each symbol at the one it is declared inside', () => {
    // `Thinger#` starts with `Thing` but not `Thing#`, so it is not a child.
    // `local` sits in an anonymous callback: no symbol encloses it.
    expect(a.parents).toEqual([-1, -1, 1, 2, -1, -1, -1])
  })

  it('skips files outside the root, as the atlas does', () => {
    expect(Object.keys(names)).toEqual(['src/a.ts'])
  })
})
