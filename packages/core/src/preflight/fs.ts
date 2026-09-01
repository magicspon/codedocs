/** Filesystem primitives every other preflight module reads through: walking upward and JSONC. */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/**
 * Walk from a directory up to the repository root, taking the first answer.
 *
 * The root is included and the walk stops there: above it is the user's home
 * directory, whose `node_modules` says nothing about this repository.
 */
export function upward<T>(
  root: string,
  from: string,
  at: (directory: string) => T | undefined,
): T | undefined {
  let directory = resolve(from)
  const stop = resolve(root)
  for (;;) {
    const found = at(directory)
    if (found !== undefined) return found
    if (directory === stop) return undefined
    const parent = dirname(directory)
    if (parent === directory) return undefined
    directory = parent
  }
}

/** Parse a JSON file that is allowed comments and trailing commas, or `undefined`. */
export function readJsonc(
  absolute: string,
): Record<string, unknown> | undefined {
  let text
  try {
    text = readFileSync(absolute, 'utf8')
  } catch {
    return undefined // Absent, or unreadable: the same answer either way.
  }
  try {
    return asRecord(JSON.parse(stripJsonc(text)))
  } catch {
    // A config codedocs cannot parse is not a reason to refuse an answer. It
    // fingerprints as an empty config, so an edit that makes it parse again
    // moves the fingerprint and re-analyses the project.
    return undefined
  }
}

/** Remove comments and trailing commas, leaving string literals untouched. */
function stripJsonc(text: string): string {
  let out = ''
  let index = 0
  while (index < text.length) {
    const character = text[index]!
    if (character === '"') {
      const end = endOfString(text, index)
      out += text.slice(index, end)
      index = end
      continue
    }
    if (character === '/' && text[index + 1] === '/') {
      const end = text.indexOf('\n', index)
      index = end === -1 ? text.length : end
      continue
    }
    if (character === '/' && text[index + 1] === '*') {
      const end = text.indexOf('*/', index + 2)
      index = end === -1 ? text.length : end + 2
      continue
    }
    out += character
    index += 1
  }
  return out.replace(/,(\s*[}\]])/g, '$1')
}

/** The offset just past the string literal starting at `start`. */
function endOfString(text: string, start: number): number {
  let index = start + 1
  while (index < text.length) {
    const character = text[index]
    if (character === '\\') index += 2
    else if (character === '"') return index + 1
    else index += 1
  }
  return text.length
}

/** A value as an object, or an empty one. Config files are user input. */
export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/** A value as a string array, or `undefined` where the key was absent or wrong. */
export function asStrings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((entry): entry is string => typeof entry === 'string')
}
