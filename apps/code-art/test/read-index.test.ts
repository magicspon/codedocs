import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, describe, expect, it } from 'vitest'
import { readAtlas } from '../scripts/read-index.ts'

const dir = mkdtempSync(join(tmpdir(), 'code-art-test-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

/**
 * A minimal index: only the columns the reader reads, in the store's shape.
 * `modern` adds the two tables older schema versions lack.
 */
function index(name: string, modern: boolean): string {
  const path = join(dir, `${name}.db`)
  const db = new DatabaseSync(path)
  db.exec(`
    create table meta (key text, value text);
    create table path (id integer primary key, path text);
    create table node (id integer primary key, path_id integer, descriptors text);
    create table project (path_id integer);
    create table file (path_id integer, size integer);
    create table file_project (file_id integer, project_id integer, canonical integer);
    create table file_import (from_id integer, to_id integer);
    create table symbol (path_id integer, kind integer);
    create table call_edge (from_id integer, to_id integer);
    create table unresolved_call (path_id integer);

    insert into meta values ('commit', 'abc123'), ('analysedAt', '2026-09-01');
    insert into path values (1, 'src/a.ts'), (2, 'src/b.ts'), (3, 'tsconfig.json'), (4, '../../elsewhere/c.ts');
    insert into node values (10, 1, ''), (11, 1, 'a'), (20, 2, ''), (21, 2, 'b'), (40, 4, 'c');
    insert into project values (3);
    insert into file values (1, 100), (2, 200), (4, 999);
    insert into file_project values (1, 3, 1), (2, 3, 1);
    insert into file_import values (2, 1), (2, null), (1, 1);
    insert into symbol values (1, 0), (1, 0), (1, 1), (2, 5);
    -- b calls a twice, a calls itself once, c (outside the root) calls a.
    insert into call_edge values (21, 11), (21, 11), (11, 11), (40, 11);
    insert into unresolved_call values (2), (2), (2);
  `)
  if (modern) {
    db.exec(`
      create table label (node_id integer, axis integer, value integer);
      create table reference_edge (to_id integer);
      insert into label values (20, 0, 1), (20, 1, 4);
      insert into reference_edge values (11), (11), (21);
    `)
  }
  db.close()
  return path
}

describe('readAtlas', () => {
  const atlas = readAtlas(index('modern', true), 'demo')
  const [a, b] = atlas.files

  it('reads one row per file inside the root, sorted by path', () => {
    expect(atlas.files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts'])
    expect(atlas).toMatchObject({
      name: 'demo',
      commit: 'abc123',
      projects: ['tsconfig.json'],
    })
    expect(a!.project).toBe(0)
  })

  it('counts symbols by kind, labels, references and blind spots', () => {
    expect(a!.kinds.slice(0, 2)).toEqual([2, 1])
    expect(b!.kinds[5]).toBe(1)
    expect(b).toMatchObject({ role: 1, generated: true, unresolved: 3 })
    expect(a!.refsIn).toBe(2)
  })

  it('aggregates calls between files, and keeps calls within a file on the file', () => {
    expect(atlas.calls).toEqual([[1, 0, 2]])
    expect(a).toMatchObject({ callsIn: 2, callsSelf: 1 })
    expect(b!.callsOut).toBe(2)
  })

  it('keeps only resolved imports between two different files', () => {
    expect(atlas.imports).toEqual([[1, 0, 1]])
  })

  it('reads an older index that lacks labels and references', () => {
    const old = readAtlas(index('old', false), 'old')
    expect(old.files[1]).toMatchObject({ role: 0, generated: false, refsIn: 0 })
  })
})

describe('readAtlas limits', () => {
  it('keeps only the heaviest links when asked for fewer', () => {
    const capped = readAtlas(index('capped', true), 'capped', {
      calls: 0,
      imports: 0,
    })
    expect(capped.calls).toEqual([])
    expect(capped.imports).toEqual([])
    // The counts on each file are still whole: only the link list is trimmed.
    expect(capped.files[0]!.callsIn).toBe(2)
  })
})
