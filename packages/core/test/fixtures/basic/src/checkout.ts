import { billCustomer, charge } from './barrel.ts'

/** Calls through a plain re-export. */
export function checkout(total: number): string {
  return charge(total)
}

/** Calls through a renamed re-export, and through a local binding. */
export const settle = (total: number): string => {
  const run = billCustomer
  return run(total)
}

/** A module-level call, which has no enclosing declaration at all. */
export const bootTotal: string = checkout(1)
