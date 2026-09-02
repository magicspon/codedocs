/**
 * The tables, and the version that gates them.
 *
 * **Every string the model repeats is interned here and nowhere else.** A
 * `SymbolId` is `path#qualified`, so storing it verbatim wrote the path three
 * times per symbol and twice more per edge; the tables below hold integers and
 * the reads rebuild the strings. That is invisible above this module — the
 * operations still see `SymbolId` and `FilePath`, and every answer is byte for
 * byte the one the skeleton gave — and it takes cal.com from 61 MB to 17.6 MB,
 * which is the 20 MB ADR 0004 measured. `microsoft/vscode`, the ceiling test,
 * goes from 851 MB to 184 MB. No query got slower: `callers` on a 1,038-edge
 * hub is 2.6 ms warm either way, because the joins the interning adds are all
 * primary-key lookups.
 */

/**
 * Bumped whenever the shape below changes. A mismatch discards the index and
 * rebuilds cold — TypeScript's own builder does exactly this, and a migration's
 * failure mode is a subtly wrong index against a rebuild's failure mode of a wait.
 */
export const STORE_SCHEMA_VERSION = 8

/** Every table the index holds, for the drop-and-rebuild path and for clearing. */
export const TABLES: readonly string[] = [
  'meta',
  'path',
  'node',
  'project',
  'file',
  'seen_file',
  'file_project',
  'file_import',
  'symbol',
  'declaration',
  'call_edge',
  'reference_edge',
  'unresolved_call',
  'unresolved_specifier',
]

export const DDL = `
create table if not exists meta (
  key text primary key,
  value text not null
) strict;

create table if not exists path (
  id integer primary key,
  path text not null unique
) strict;

create table if not exists node (
  id integer primary key,
  path_id integer not null,
  qualified text not null,
  unique (path_id, qualified)
) strict;

create table if not exists project (
  path_id integer primary key,
  fidelity integer not null,
  root_file_count integer not null,
  analysed_at text not null,
  fingerprint text not null,
  cause integer,
  postinstall integer not null
) strict;

create table if not exists file (
  path_id integer primary key,
  content_hash text not null,
  size integer not null,
  mtime_ms real not null,
  export_shape_hash text not null
) strict;

create table if not exists seen_file (
  path_id integer primary key
) strict;

create table if not exists file_import (
  from_id integer not null,
  specifier text not null,
  to_id integer,
  primary key (from_id, specifier)
) strict;

create table if not exists file_project (
  file_id integer not null,
  project_id integer not null,
  canonical integer not null,
  primary key (file_id, project_id)
) strict;

create table if not exists symbol (
  node_id integer primary key,
  path_id integer not null,
  name text not null,
  kind integer not null,
  start integer not null,
  line integer not null,
  durable integer not null,
  callable integer not null,
  collisions integer not null
) strict;

create table if not exists declaration (
  path_id integer not null,
  start integer not null,
  node_id integer not null,
  primary key (path_id, start)
) strict;

create table if not exists call_edge (
  rowid_ integer primary key autoincrement,
  from_id integer not null,
  to_id integer not null,
  attribution integer not null,
  path_id integer not null,
  line integer not null,
  provenance integer not null,
  derivation integer not null
) strict;

create table if not exists reference_edge (
  rowid_ integer primary key autoincrement,
  from_id integer not null,
  to_id integer not null,
  kind integer not null,
  attribution integer not null,
  path_id integer not null,
  line integer not null,
  provenance integer not null,
  derivation integer not null
) strict;

create table if not exists unresolved_call (
  rowid_ integer primary key autoincrement,
  path_id integer not null,
  line integer not null,
  cause integer not null,
  name text
) strict;

create table if not exists unresolved_specifier (
  rowid_ integer primary key autoincrement,
  path_id integer not null,
  specifier text not null,
  line integer not null,
  cause integer not null
) strict;

create index if not exists file_import_to on file_import(to_id);
create index if not exists symbol_name on symbol(name);
create index if not exists symbol_site on symbol(path_id, start);
create index if not exists call_edge_to on call_edge(to_id);
create index if not exists call_edge_from on call_edge(from_id);
create index if not exists reference_edge_to on reference_edge(to_id);
create index if not exists reference_edge_from on reference_edge(from_id);
`
// There is no separate index on `symbol(path_id)`: `symbol_site` leads with that
// column, so the file-scoped delete already uses it. The skeleton carried both,
// which cost 3.8 MB on cal.com and bought nothing.
