import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, describe, expect, it } from 'vitest'
import { readNames } from '../scripts/read-names.ts'
import { linksOf } from '../src/lib/atlas.ts'

const dir = mkdtempSync(join(tmpdir(), 'code-art-names-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

/** The tables the reader touches, in the store's shape. */
function index(): string {
  const path = join(dir, 'index.db')
  const db = new DatabaseSync(path)
  db.exec(`
    create table path (id integer primary key, path text);
    create table node (id integer primary key, path_id integer, descriptors text);
    create table symbol (node_id integer, path_id integer, kind integer, name text, start integer);
    create table call_edge (from_id integer, to_id integer);
    create table reference_edge (from_id integer, to_id integer, kind integer);
    insert into path values (1, 'src/a.ts'), (2, '../outside.ts'), (3, 'src/b.ts');
    insert into node values
      (1, 1, 'second().'), (2, 1, 'first().'), (3, 1, 'Thing#'),
      (4, 1, 'Thing#run().'), (5, 1, 'Thing#run().step.'),
      (6, 1, 'Thinger#'), (7, 1, 'it(\`works\`).local.'), (8, 2, 'skip().'),
      (9, 3, ''), (10, 3, 'go().');
    insert into symbol values
      (1, 1, 0, 'second', 50), (2, 1, 0, 'first', 10), (3, 1, 1, 'Thing', 30),
      (4, 1, 6, 'run', 32), (5, 1, 5, 'step', 34), (6, 1, 1, 'Thinger', 60),
      (7, 1, 5, 'local', 70), (8, 2, 0, 'skip', 0), (10, 3, 0, 'go', 0);
    -- \`go\` calls \`run\` twice; \`first\` calls \`second\`; \`run\` recurses;
    -- b's top-level code calls \`first\`; \`Thinger\` extends \`Thing\`.
    insert into call_edge values (10, 4), (10, 4), (2, 1), (4, 4), (9, 2);
    insert into reference_edge values (6, 3, 1);
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
    expect(Object.keys(names).sort()).toEqual(['src/a.ts', 'src/b.ts'])
  })

  it('keeps both ends of each link, naming other files by path', () => {
    expect(a.peers).toEqual(['src/b.ts'])
    // `first` calls `second`, and is called from b's top-level code.
    expect(linksOf(a, 0)).toEqual([
      { symbol: 0, via: 0, inbound: false, peer: -1, other: 4, count: 1 },
      { symbol: 0, via: 0, inbound: true, peer: 0, other: -1, count: 1 },
    ])
    // Two call sites in `go` make one link of weight two; recursion is dropped.
    expect(linksOf(a, 2)).toEqual([
      { symbol: 2, via: 0, inbound: true, peer: 0, other: 0, count: 2 },
    ])
    // Extends is reference kind 1, so way 2.
    expect(linksOf(a, 5)).toEqual([
      { symbol: 5, via: 2, inbound: false, peer: -1, other: 1, count: 1 },
    ])
    const b = names['src/b.ts']!
    expect(b.peers).toEqual(['src/a.ts'])
    expect(linksOf(b, 0)).toEqual([
      { symbol: 0, via: 0, inbound: false, peer: 0, other: 2, count: 2 },
    ])
  })
})
