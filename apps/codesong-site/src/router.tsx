import {
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
  RouterProvider,
} from '@tanstack/react-router'
import type { JSX } from 'react'
import { HowItWorks } from './HowItWorks.tsx'
import { Layout } from './Layout.tsx'
import { SongList } from './SongList.tsx'
import { SongPage, UnknownSong } from './SongPage.tsx'
import { findSong } from './songs.ts'

const rootRoute = createRootRoute({ component: Layout })

/** `/` lists every song. */
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: SongList,
})

/**
 * `/how-it-works` explains the songs. A fixed path outranks `$song`, so it
 * wins over a song of the same name.
 */
const howItWorksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'how-it-works',
  component: HowItWorks,
})

/** `/name` plays one song, so each can be shared by its own link. */
const songRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '$song',
  loader: ({ params }) => {
    const song = findSong(params.song)
    if (!song) throw notFound()
    return song
  },
  component: SongPage,
  notFoundComponent: UnknownSong,
})

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, howItWorksRoute, songRoute]),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

/** The site, routed: `/` lists the songs, `/name` plays one. */
export function Site(): JSX.Element {
  return <RouterProvider router={router} />
}
