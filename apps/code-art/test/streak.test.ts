import { describe, expect, it } from 'vitest'
import { streakGeometry } from '../src/lib/streak.ts'

describe('streakGeometry', () => {
  const radius = 2
  const streak = streakGeometry(radius, 1, 0.05)
  const p = streak.getAttribute('position')

  it('bends round its orbit, every point on it within its width', () => {
    for (let i = 0; i < p.count; i++) {
      // The orbit's centre lies `radius` down -x from the streak's middle.
      const r = Math.hypot(p.getX(i) + radius, p.getZ(i))
      expect(Math.abs(r - radius)).toBeLessThanOrEqual(0.05 + 1e-6)
    }
  })

  it('runs along z, as long as asked', () => {
    let [lo, hi] = [Infinity, -Infinity]
    for (let i = 0; i < p.count; i++) {
      lo = Math.min(lo, p.getZ(i))
      hi = Math.max(hi, p.getZ(i))
    }
    // A chord of a 1-long arc on a radius-2 orbit, just short of 1.
    expect(hi - lo).toBeGreaterThan(0.95)
    expect(hi - lo).toBeLessThan(1)
  })
})
