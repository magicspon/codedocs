import { Ledger, type Money, type Spendable } from './types.ts'

/** One declaration carrying both heritage kinds. */
export class Wallet extends Ledger implements Spendable {
  spend(): void {
    this.record()
  }
}

/** `Money` twice in one signature: two sites, one pair. */
export const price = (paid: Money): Money => paid

/** The class as a value, which is a reference rather than a call. */
export const ledgers: Ledger[] = []
