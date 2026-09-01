/** The scalar and structural checks every schema reader is built from, and the errors they raise. */

// cspell:ignore exlucde — a deliberate transposition, quoted from ADR 0010

import { invalid } from './errors.ts'

/** A plain JSON object, which is the one thing `typeof value === 'object'` is not. */
export function expectObject(
  value: unknown,
  key: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalid(`must be an object, got ${describe(value)}`, key)
  }
  return value as Record<string, unknown>
}

export function readString(value: unknown, key: string): string {
  if (typeof value !== 'string' || value === '') {
    throw invalid(`must be a non-empty string, got ${describe(value)}`, key)
  }
  return value
}

export function readStringArray(
  value: unknown,
  key: string,
): readonly string[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    throw invalid(`must be an array of strings, got ${describe(value)}`, key)
  }
  return value.map((entry, index) => readString(entry, `${key}[${index}]`))
}

export function readEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  key: string,
): T | null {
  if (value === undefined) return null
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw invalid(
      `must be one of ${allowed.map((one) => `\`${one}\``).join(', ')}, got ${describe(value)}`,
      key,
    )
  }
  return value as T
}

/**
 * Refuse a key the schema does not know, naming its nearest valid neighbour.
 *
 * ADR 0010 accepts the cost — a config written for a later codedocs fails on an
 * earlier one — because the alternative is `exlucde`, which under lenient
 * parsing parses, excludes nothing, and says nothing about either.
 */
export function rejectUnknownKeys(
  block: Record<string, unknown>,
  prefix: string,
  allowed: readonly string[],
): void {
  for (const key of Object.keys(block)) {
    if (allowed.includes(key)) continue
    const near = nearest(key, allowed)
    throw invalid(
      near === null
        ? `is not a key codedocs knows. Valid keys here: ${allowed.map((one) => `\`${one}\``).join(', ')}`
        : `is not a key codedocs knows — did you mean \`${near}\`?`,
      prefix === '' ? key : `${prefix}.${key}`,
    )
  }
}

/**
 * The closest valid key, or `null` when nothing is close enough to name.
 *
 * A wrong guess is worse than none: `exclude` is nearest to `discover` only in
 * the sense that something has to be, and pointing there sends the user to a
 * key that would not have done what they meant.
 */
function nearest(key: string, allowed: readonly string[]): string | null {
  let best: string | null = null
  let bestDistance = Infinity
  for (const candidate of allowed) {
    const distance = editDistance(key, candidate)
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  const budget = Math.min(3, Math.floor(key.length / 2))
  return bestDistance <= budget ? best : null
}

/** Levenshtein distance, one row at a time. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i]
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(
        previous[j]! + 1,
        row[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    previous = row
  }
  return previous[b.length]!
}

/**
 * What was found where a value was expected.
 *
 * A scalar is quoted back because it is what the user typed; a container is
 * named by its type, because printing a whole object at someone explains
 * nothing they did not already write.
 */
export function describe(value: unknown): string {
  if (value === null) return '`null`'
  if (Array.isArray(value)) return 'an array'
  if (typeof value === 'object') return 'an object'
  return `\`${JSON.stringify(value)}\``
}
