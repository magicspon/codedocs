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

/**
 * Indexed by a symbol link's way: calls, then `REFERENCE_KINDS` (references,
 * extends, implements, type references). Calls run hottest; types coolest.
 */
export const LINK_COLORS: readonly Color[] = [
  '#5fe0ff',
  '#e6e9ff',
  '#ffb347',
  '#ffe066',
  '#b48cff',
].map((hex) => new Color(hex))

/** Generated code, whatever its role: it was written by a tool, so it is drawn apart. */
export const GENERATED_COLOR: Color = new Color('#8b5cf6')
