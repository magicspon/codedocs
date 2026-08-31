export interface Gateway {
  capture(amount: number): string
}

export class StripeGateway implements Gateway {
  capture(amount: number): string {
    return `stripe:${amount}`
  }
}

export function charge(amount: number): string {
  return new StripeGateway().capture(amount)
}
