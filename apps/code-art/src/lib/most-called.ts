import { isTest, type FileDatum } from './atlas.ts'

/**
 * The `count` files the rest of the code calls most, most called first, as
 * `[file, callsIn]`. Tests never count: they call, they are not called. Ties
 * go to the earlier file, so the pick is stable.
 */
export function mostCalled(
  files: readonly FileDatum[],
  count: number,
): (readonly [number, number])[] {
  return files
    .map((f, i) => [i, f.callsIn] as const)
    .filter(([i, calls]) => calls > 0 && !isTest(files[i]!))
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, count)
}
