/**
 * A file nothing imports statically.
 *
 * `import()` is how a route, a plugin or a lazily loaded component is reached,
 * so a wave that swept only static specifiers would never re-extract this file
 * when `payments.ts` changes shape underneath it.
 */
export async function loadPayments(): Promise<string> {
  const payments = await import('./payments.ts')
  return payments.charge(1)
}
