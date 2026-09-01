/** Reading JSON with comments and trailing commas, which is what `.jsonc` promises. */

import { invalid } from './errors.ts'

/**
 * Read JSON with comments and trailing commas, which is what `.jsonc` promises.
 *
 * Comments and stray commas are blanked rather than removed so that every offset
 * survives, and `JSON.parse`'s own position in a syntax error still points at
 * the character the user wrote.
 */
export function parseJsonc(text: string): unknown {
  try {
    return JSON.parse(stripJsonc(text))
  } catch (error) {
    throw invalid(
      `is not valid JSONC — ${error instanceof Error ? error.message : String(error)}`,
      '',
    )
  }
}

/**
 * Blank out comments and trailing commas, preserving every offset.
 *
 * Two passes rather than one: whether a comma is trailing depends on what comes
 * *after* it, and what comes after it may be a comment. Blanking every comment
 * first makes the second pass a question about whitespace alone.
 */
function stripJsonc(text: string): string {
  return blankTrailingCommas(blankComments(text))
}

/** Replace each comment with spaces, leaving newlines and string bodies alone. */
function blankComments(text: string): string {
  const out = units(text)
  let index = 0
  while (index < out.length) {
    if (out[index] === '"') {
      index = endOfString(out, index)
      continue
    }
    if (out[index] === '/' && out[index + 1] === '/') {
      const end = text.indexOf('\n', index)
      index = blank(out, index, end === -1 ? out.length : end)
      continue
    }
    if (out[index] === '/' && out[index + 1] === '*') {
      const end = text.indexOf('*/', index + 2)
      index = blank(out, index, end === -1 ? out.length : end + 2)
      continue
    }
    index += 1
  }
  return out.join('')
}

/** Replace each comma that only a `}` or `]` follows. Comments are already gone. */
function blankTrailingCommas(text: string): string {
  const out = units(text)
  let index = 0
  while (index < out.length) {
    if (out[index] === '"') {
      index = endOfString(out, index)
      continue
    }
    if (out[index] === ',') {
      let next = index + 1
      while (next < out.length && /\s/.test(out[next]!)) next += 1
      if (out[next] === '}' || out[next] === ']') out[index] = ' '
    }
    index += 1
  }
  return out.join('')
}

/**
 * One array element per UTF-16 unit.
 *
 * Not `[...text]`, which yields code points: an astral character would then be
 * one element where `String.prototype.indexOf` counts two, and every offset
 * after the first emoji in a comment would be wrong.
 */
function units(text: string): string[] {
  return Array.from({ length: text.length }, (_, index) => text[index]!)
}

/** The index just past the closing quote of the string starting at `from`. */
function endOfString(out: readonly string[], from: number): number {
  let index = from + 1
  while (index < out.length && out[index] !== '"') {
    index += out[index] === '\\' ? 2 : 1
  }
  return index + 1
}

/** Overwrite `[from, to)` with spaces, keeping newlines so positions still read. */
function blank(out: string[], from: number, to: number): number {
  for (let i = from; i < to; i += 1) if (out[i] !== '\n') out[i] = ' '
  return to
}
