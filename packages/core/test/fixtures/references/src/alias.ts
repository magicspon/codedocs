import type * as wallet from './wallet.ts'

/**
 * A second symbol named `Wallet`, which names the first.
 *
 * So that `references Wallet` resolves to two symbols with an edge between
 * them: the one case where both directions read the same fact.
 */
export type Wallet = wallet.Wallet
