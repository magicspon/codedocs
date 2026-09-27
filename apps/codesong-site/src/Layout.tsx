import { Link, Outlet } from '@tanstack/react-router'
import type { JSX } from 'react'

/** The frame around every page: the site name, then the page. */
export function Layout(): JSX.Element {
  return (
    <main className="page">
      <header>
        <Link to="/" className="brand">
          codesong
        </Link>
        <p className="tagline">
          Code repositories turned into music.{' '}
          <Link to="/how-it-works">How it works</Link>
        </p>
      </header>
      <Outlet />
    </main>
  )
}
