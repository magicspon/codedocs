/**
 * One file carrying every syntactic form that names a module, each pointed at a
 * module of its own so an import edge says which form produced it.
 *
 * `module: preserve` is what lets `import = require` sit beside the rest, which
 * is the point: the two live in the same repositories and only one of them was
 * being swept.
 */
import { statically } from './statically'
import required = require('./required')

export { reexported } from './reexported'

/** A route, a plugin, a lazily loaded component: the reason #30 exists. */
export async function lazily(): Promise<string> {
  const module = await import('./lazily')
  return module.lazily()
}

/** A type position reaches a module without importing a value from it. */
export type Typed = typeof import('./typed').typed

export const eager = (): string => statically() + required.required()

/** No literal, so no file anyone can name statically. */
export const unknowable = async (where: string): Promise<unknown> =>
  import(where)

/** A relative specifier that resolves to nothing, in a dynamic position. */
export const gone = async (): Promise<unknown> => import('./not-here')
