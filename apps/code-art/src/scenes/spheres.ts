import { SphereGeometry } from 'three'

/**
 * Unit spheres shared by every system in the sky. Systems round the craft
 * come and go by the dozen; one shape each saves building and uploading a
 * fresh copy per ring, sun and moon. Never disposed: they live as long as
 * the page.
 */

/** A planet, or a marker round one. */
export const PLANET_SPHERE: SphereGeometry = new SphereGeometry(1, 16, 12)
/** A glimpsed moon: too small to need the detail. */
export const MOON_SPHERE: SphereGeometry = new SphereGeometry(1, 12, 8)
/** A system's sun. */
export const SUN_SPHERE: SphereGeometry = new SphereGeometry(1, 24, 16)
