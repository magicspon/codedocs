/** Direct recursion, so a path can close a loop on its own root. */
export function countdown(n: number): number {
  return n > 0 ? countdown(n - 1) : 0
}

/** Mutual recursion, so a cycle can close two steps out rather than one. */
export function ping(n: number): number {
  return n > 0 ? pong(n - 1) : 0
}

export function pong(n: number): number {
  return ping(n - 1)
}

/** Two sites for one step, so a path groups them rather than forking. */
export function twice(n: number): number {
  const first = countdown(n)
  return first + countdown(n + 1)
}
