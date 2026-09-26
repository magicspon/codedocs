import {
  createBrowserHistory,
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
  redirect,
  RouterProvider,
} from '@tanstack/react-router'
import type { JSX } from 'react'
import { App } from './App.tsx'
import { Loader } from './Loader.tsx'
import { Landing, UnknownDataset } from './Landing.tsx'
import { DATASETS, loadSeries } from './lib/load.ts'
import { queryClient } from './queries.ts'
import { viewSearch, type ViewSearch } from './search.ts'

const rootRoute = createRootRoute()

/**
 * `/` lists the datasets to pick from. An old `?data=name` bookmark still
 * lands on its dataset, with the rest of its view kept.
 */
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (raw): ViewSearch & { data?: string } => ({
    ...viewSearch(raw),
    data: typeof raw.data === 'string' ? raw.data : undefined,
  }),
  beforeLoad: ({ search: { data, ...view } }) => {
    if (data)
      throw redirect({
        to: '/$dataset',
        params: { dataset: data },
        search: view,
      })
  },
  component: Landing,
})

/** `/name` opens one dataset; the view within it lives in the search. */
const datasetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '$dataset',
  validateSearch: viewSearch,
  loader: ({ params: { dataset } }) => {
    if (!DATASETS.includes(dataset)) throw notFound()
    // Through the query cache so switching back to a dataset is instant.
    return queryClient.ensureQueryData({
      queryKey: ['series', dataset],
      queryFn: () => loadSeries(dataset),
    })
  },
  // A parse is costly and the data never changes, so the search changing
  // with every keystroke must not load it again.
  staleTime: Infinity,
  component: App,
  notFoundComponent: UnknownDataset,
})

/**
 * The single file `codedocs art` writes is opened from disk, where only the
 * hash can carry a route; everywhere else it is the path.
 */
const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, datasetRoute]),
  history:
    import.meta.env.MODE === 'embed'
      ? createHashHistory()
      : createBrowserHistory(),
  defaultPendingComponent: Loader,
  // The parse blocks the main thread, so the spinner must be up before it.
  defaultPendingMs: 0,
  defaultPendingMinMs: 0,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

/** The viewer, routed: `/` picks a dataset, `/name` shows it. */
export function Viewer(): JSX.Element {
  return <RouterProvider router={router} />
}
