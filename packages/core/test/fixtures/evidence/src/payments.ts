import type { Money } from './types.ts'

/** One of two callees, so at `--limit 2` this kind stays whole. */
export function audit(paid: Money): void {
  void paid.amount
}

/** The other callee. */
export function post(paid: Money): void {
  void paid.amount
}

/**
 * The subject: two callees, three callers, and a type it only names.
 *
 * The counts are the point. At `--limit 2` its callers truncate and its callees
 * do not, which is the per-kind budget ADR 0006 gives `evidence` — a shared pool
 * would let a third caller evict a fact of another kind entirely.
 */
export function charge(paid: Money): Money {
  audit(paid)
  post(paid)
  return paid
}
