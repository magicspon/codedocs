import { charge } from './payments.ts'
import type { Money } from './types.ts'

/** Three callers, so that kind truncates where the two callees do not. */
export function one(paid: Money): Money {
  return charge(paid)
}

export function two(paid: Money): Money {
  return charge(paid)
}

export function three(paid: Money): Money {
  return charge(paid)
}
