/** Reading labels back — the third kind of thing the index holds. */

import type { Label } from '../model.ts'
import type { Naming } from '../naming.ts'
import {
  DERIVATIONS,
  LABEL_AXES,
  LABEL_VALUES,
  named,
  PROVENANCES,
} from './enums.ts'
import { idOf } from './shared.ts'
import type { Store } from './open.ts'

/** One `label` row with its node rejoined to the string the model uses. */
type LabelRow = {
  path: string
  descriptors: string
  axis: number
  value: number
  provenance: number
  derivation: number
}

const LABEL_SELECT = `select p.path, n.descriptors, l.axis, l.value, l.provenance,
    l.derivation
  from label l
  join node n on n.id = l.node_id
  join path p on p.id = n.path_id`

const toLabel = (naming: Naming, row: LabelRow): Label => ({
  node: idOf(naming, row.path, row.descriptors),
  axis: named(LABEL_AXES, row.axis, 'label axis'),
  value: named(LABEL_VALUES, row.value, 'label value'),
  provenance: named(PROVENANCES, row.provenance, 'provenance'),
  derivation: named(DERIVATIONS, row.derivation, 'derivation'),
})

/**
 * Every label in the index, sorted by node then axis.
 *
 * Read whole because every caller wants it whole: a scope filter asks the same
 * question of each of an answer's results, and `doctor`'s disagreement list is
 * over the entire set. Two to six rows per file, all integers, so the scan is
 * cheaper than the round trips that would replace it.
 */
export function readLabels(store: Store): Label[] {
  return (
    store.db
      .prepare(`${LABEL_SELECT} order by p.path, n.descriptors, l.axis`)
      .all() as LabelRow[]
  ).map((row) => toLabel(store.naming, row))
}
