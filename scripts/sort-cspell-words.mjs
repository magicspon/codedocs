// Keeps cspell.words.txt alphabetised so the list stays reviewable.
//
// The file is append-only in practice — a spell-check failure sends you to the
// bottom to paste a word. Left alone that turns a diff into a scavenger hunt
// and hides duplicates that differ only in case. Sorting on commit means the
// diff for a new word is one line in one predictable place.
//
// Comparison is case-insensitive, so `Aico` sorts next to `attero` rather than
// ahead of every lowercase entry. Ties (same word, different case) fall back to
// a code-point compare for a stable order.
//
// Run by nano-staged when the word list is staged, or by hand:
//
//   node scripts/sort-cspell-words.mjs [file...]

import { readFileSync, renameSync, writeFileSync } from 'node:fs'

const DEFAULT_FILE = 'cspell.words.txt'

/**
 * Sorts one word list in place.
 *
 * @param {string} file Path to a newline-delimited word list.
 * @returns {boolean} Whether the file changed.
 */
function sortWordList(file) {
  const before = readFileSync(file, 'utf8')

  // Blank lines carry no meaning here; dropping them keeps the sort total.
  const words = before
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')

  const seen = new Set()
  const unique = words.filter((word) => {
    const key = word.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  unique.sort((a, b) => {
    const folded = a.toLowerCase().localeCompare(b.toLowerCase())
    return folded === 0 ? (a < b ? -1 : a > b ? 1 : 0) : folded
  })

  const after = `${unique.join('\n')}\n`
  if (after === before) return false

  // nano-staged runs each glob's tasks in parallel, so `cspell` may be loading
  // this file as a dictionary while we rewrite it. Rename is atomic, so that
  // reader sees the old list or the new one — never a half-written one. Both
  // hold the same words, so its verdict is the same either way.
  const temp = `${file}.tmp`
  writeFileSync(temp, after)
  renameSync(temp, file)
  return true
}

// nano-staged appends the staged paths; the default covers a bare manual run.
const files = process.argv.slice(2)
for (const file of files.length > 0 ? files : [DEFAULT_FILE]) {
  if (sortWordList(file)) console.log(`sorted ${file}`)
}
