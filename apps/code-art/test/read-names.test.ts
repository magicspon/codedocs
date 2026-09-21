import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, describe, expect, it } from 'vitest'
import { readNames } from '../scripts/read-names.ts'

const dir = mkdtempSync(join(tmpdir(), 'code-art-names-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

/** The two tables the reader touches, in the store's shape. */
function index(): string {
  const path = join(dir, 'index.db')
  const db = new DatabaseSync(path)
  db.exec(`
    create table path (id integer primary key, path text);
    create table symbol (path_id integer, kind integer, name text, start integer);
    insert into path values (1, 'src/a.ts'), (2, '../outside.ts');
    insert into symbol values
      (1, 0, 'second', 50), (1, 0, 'first', 10), (1, 1, 'Thing', 30), (2, 0, 'skip', 0);
  `)
  db.close()
  return path
}

describe('readNames', () => {
  const names = readNames(index())

  it('groups names by kind, in source order', () => {
    expect(names['src/a.ts']).toEqual([
      ['first', 'second'],
      ['Thing'],
      [],
      [],
      [],
      [],
      [],
      [],
    ])
  })

  it('skips files outside the root, as the atlas does', () => {
    expect(Object.keys(names)).toEqual(['src/a.ts'])
  })
})
