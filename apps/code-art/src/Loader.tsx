import type { JSX } from 'react'

/**
 * A spinner over the stage while a dataset loads, parses and lays out.
 *
 * The same markup sits in `index.html`, so the page shows it while the
 * browser is still reading a large inline dataset, before any script runs.
 */
export function Loader(): JSX.Element {
  return (
    <div className="loader" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span className="loader-label">Loading…</span>
    </div>
  )
}
