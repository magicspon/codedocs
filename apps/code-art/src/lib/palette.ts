import { Color } from 'three'

/**
 * Colours for each dimension the index stores. Kinds are spread around the
 * wheel so a cluster's mix of functions, types and classes reads as its hue.
 */

/** Indexed by `KINDS`: function, class, interface, typeAlias, enum, variable, method, namespace. */
export const KIND_COLORS: readonly Color[] = [
  '#ffd27a',
  '#ff6b8b',
  '#7ad7ff',
  '#8fa8ff',
  '#c38bff',
  '#fff2de',
  '#ff9f5a',
  '#6effc4',
].map((hex) => new Color(hex))

/** Indexed by `ROLES`: source, test, config. */
export const ROLE_COLORS: readonly Color[] = [
  '#c9ccd6',
  '#3fd0c0',
  '#f2b441',
].map((hex) => new Color(hex))

/** Generated code, whatever its role: it was written by a tool, so it is drawn apart. */
export const GENERATED_COLOR: Color = new Color('#8b5cf6')

/** A stable hue per project, for tinting districts and arms. */
export function projectColor(
  project: number,
  saturation = 0.45,
  lightness = 0.55,
): Color {
  if (project < 0) return new Color().setHSL(0, 0, lightness * 0.6)
  // The golden angle keeps neighbouring indices far apart on the wheel.
  return new Color().setHSL((project * 0.618034) % 1, saturation, lightness)
}
