import { BufferGeometry, Float32BufferAttribute } from 'three'

/** Points along a streak, and round it. */
const ALONG = 24
const AROUND = 6

/**
 * A streak of disc matter: a thin tube bent to follow an orbit of `radius`,
 * `length` long and `width` across at its widest, tapering to points at both
 * ends. It is built round its own middle, with its long axis on `z` and the
 * orbit's centre `radius` away down `-x`, so a body turned to its phase lies
 * along its orbit and curves with it.
 */
export function streakGeometry(
  radius: number,
  length: number,
  width: number,
): BufferGeometry {
  // Never more than a third of the way round, however small the orbit.
  const sweep = Math.min(length / radius, (Math.PI * 2) / 3)
  const positions: number[] = []
  for (let i = 0; i <= ALONG; i++) {
    const t = i / ALONG
    const a = (t - 0.5) * sweep
    // Out from the orbit's centre, and the streak's middle line.
    const [nx, nz] = [Math.cos(a), Math.sin(a)]
    const [cx, cz] = [radius * nx - radius, radius * nz]
    const taper = Math.sin(Math.PI * t) ** 0.7
    for (let j = 0; j < AROUND; j++) {
      const u = (j / AROUND) * Math.PI * 2
      const across = Math.cos(u) * width * taper
      positions.push(
        cx + nx * across,
        Math.sin(u) * width * 0.6 * taper,
        cz + nz * across,
      )
    }
  }
  const index: number[] = []
  for (let i = 0; i < ALONG; i++)
    for (let j = 0; j < AROUND; j++) {
      const a = i * AROUND + j
      const b = i * AROUND + ((j + 1) % AROUND)
      index.push(a, a + AROUND, b, b, a + AROUND, b + AROUND)
    }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(index)
  return geometry
}
