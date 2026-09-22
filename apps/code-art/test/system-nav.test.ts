import { describe, expect, it } from 'vitest'
import type { System } from '../src/lib/orbits.ts'
import {
  AT_STAR,
  bodiesOf,
  claimsOf,
  enter,
  leave,
  select,
  step,
} from '../src/lib/system-nav.ts'

const bodies = [4, 7, 9]

describe('bodiesOf', () => {
  it('lists named bodies ring by ring, skipping unnamed ones', () => {
    const ring = (symbols: number[]) => ({
      planets: symbols.map((symbol) => ({ symbol })),
    })
    const system = { rings: [ring([4, 7]), ring([-1, 9])] } as unknown as System
    expect(bodiesOf(system)).toEqual([4, 7, 9])
  })
})

describe('step', () => {
  it('starts at the first going forward and the last going back', () => {
    expect(step(AT_STAR, bodies, 1).highlight).toBe(4)
    expect(step(AT_STAR, bodies, -1).highlight).toBe(9)
  })

  it('wraps round both ways', () => {
    expect(step({ focus: [], highlight: 9 }, bodies, 1).highlight).toBe(4)
    expect(step({ focus: [], highlight: 4 }, bodies, -1).highlight).toBe(9)
  })

  it('does nothing on an empty level', () => {
    expect(step(AT_STAR, [], 1)).toBe(AT_STAR)
  })
})

describe('enter and leave', () => {
  it('zooms into the picked-out body, or the first', () => {
    expect(enter({ focus: [1], highlight: 7 }, bodies)).toEqual({
      focus: [1, 7],
      highlight: null,
    })
    expect(enter(AT_STAR, bodies).focus).toEqual([4])
  })

  it('does nothing with no bodies to enter', () => {
    expect(enter(AT_STAR, [])).toBe(AT_STAR)
  })

  it('zooms out, keeping the body just left picked out', () => {
    expect(leave({ focus: [1, 7], highlight: null })).toEqual({
      focus: [1],
      highlight: 7,
    })
    expect(leave(AT_STAR)).toBe(AT_STAR)
  })
})

describe('select', () => {
  it('zooms into a clicked body at that depth, dropping deeper focus', () => {
    expect(select({ focus: [1, 2, 3], highlight: null }, 1, 8)).toEqual({
      focus: [1, 8],
      highlight: null,
    })
  })

  it('zooms out when the focused body is clicked again', () => {
    expect(select({ focus: [1, 2], highlight: null }, 1, 2)).toEqual({
      focus: [1],
      highlight: 2,
    })
  })
})

describe('claimsOf', () => {
  const moons = (symbol: number): number => (symbol === 7 ? 2 : 0)

  it('claims Escape only once inside a body', () => {
    expect(claimsOf(AT_STAR, moons).leave).toBe(false)
    expect(claimsOf({ focus: [4], highlight: null }, moons).leave).toBe(true)
  })

  it('claims Enter only for a picked-out body with moons', () => {
    expect(claimsOf(AT_STAR, moons).enter).toBe(false)
    expect(claimsOf({ focus: [], highlight: 4 }, moons).enter).toBe(false)
    expect(claimsOf({ focus: [], highlight: 7 }, moons).enter).toBe(true)
  })
})
