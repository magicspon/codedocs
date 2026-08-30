/** @type {import("nano-staged").Configuration} */
const config = {
  // Alphabetise before the commit lands, so a new word is a one-line diff.
  'cspell.words.txt': ['node scripts/sort-cspell-words.mjs'],
  '**/*': ['oxfmt --no-error-on-unmatched-pattern', 'cspell . --quiet'],
  '*.{js,cjs,ts,tsx}': [
    'pnpm exec oxlint --deny-warnings',
    "bash -c 'pnpm typecheck'",
  ],
}

export default config
