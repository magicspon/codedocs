import { charge } from './payments.ts'
import type { Money } from './types.ts'

/** Two hops from `audit`, so `reaches` sees what `calls` cannot. */
export function checkout(paid: Money): string {
  return charge(paid)
}
