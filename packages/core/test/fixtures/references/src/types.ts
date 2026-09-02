/**
 * The three things `src/wallet.ts` names: a type it never calls, a base class it
 * extends, and an interface it implements.
 */

/** Named in signatures and called nowhere, which is the case `callers` misses. */
export interface Money {
  readonly amount: number
}

/** The base a wallet extends. Its method is called, so it has both kinds of edge. */
export class Ledger {
  record(): void {}
}

/** What a wallet implements. */
export interface Spendable {
  spend(): void
}
