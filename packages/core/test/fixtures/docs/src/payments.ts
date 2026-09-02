import type { Gateway, Money } from './types.ts'

/** One of the two implementations a count claim expects. */
export class StripeGateway implements Gateway {
  capture(amount: number): string {
    return `stripe:${amount}`
  }
}

/** The other. Adding a third is exactly what `implementations(x) == 2` catches. */
export class TestGateway implements Gateway {
  capture(amount: number): string {
    return `test:${amount}`
  }
}

/** Called by `charge` alone, so `callers(audit) == 1` and nothing outside `src/`. */
export function audit(paid: Money): void {
  void paid.amount
}

/** The subject most of the fixture's claims are about. */
export function charge(paid: Money): string {
  audit(paid)
  return new StripeGateway().capture(paid.amount)
}

/** Its inner binding is local, so nothing durable may anchor a claim to it. */
export function withLocal(): number {
  const helper = (): number => 1
  return helper()
}
