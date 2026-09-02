/** What a payment gateway must do. Two classes implement it, which a count claims. */
export interface Gateway {
  capture(amount: number): string
}

/** Named in signatures and called nowhere, which is what `usesType` asserts. */
export interface Money {
  readonly amount: number
}
