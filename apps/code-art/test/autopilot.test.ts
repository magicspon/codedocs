import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { grabbed, pilot, plan, travel } from '../src/lib/autopilot.ts'
import { heading, IDLE, launch } from '../src/lib/craft.ts'

const star = new Vector3(0, 0, 0)

describe('plan', () => {
  it('stops the asked distance from the star, on the near side, a little above', () => {
    const craft = launch(new Vector3(100, 0, 0), new Vector3(-1, 0, 0))
    const trip = plan(craft, star, 5)
    expect(trip.to.distanceTo(star)).toBeCloseTo(5)
    expect(trip.to.x).toBeGreaterThan(0)
    expect(trip.to.y).toBeGreaterThan(0)
  })

  it('takes longer for a longer trip, within bounds', () => {
    const near = plan(
      launch(new Vector3(10, 0, 0), new Vector3(-1, 0, 0)),
      star,
      5,
    )
    const far = plan(
      launch(new Vector3(90, 0, 0), new Vector3(-1, 0, 0)),
      star,
      5,
    )
    expect(far.seconds).toBeGreaterThan(near.seconds)
    expect(
      plan(launch(new Vector3(1e5, 0, 0), new Vector3(1, 0, 0)), star, 5)
        .seconds,
    ).toBeLessThanOrEqual(6)
  })
})

describe('travel', () => {
  it('arrives, still, facing the star', () => {
    // Launched facing away, so it must turn round on the way.
    const craft = launch(new Vector3(60, 0, 0), new Vector3(1, 0, 0))
    const trip = plan(craft, star, 5)
    let done = false
    for (let i = 0; i < 1000 && !done; i++) done = travel(craft, trip, 1 / 60)
    expect(done).toBe(true)
    expect(craft.position.distanceTo(trip.to)).toBeCloseTo(0)
    expect(craft.velocity.length()).toBe(0)
    const toStar = star.clone().sub(craft.position).normalize()
    expect(heading(craft, new Vector3()).dot(toStar)).toBeGreaterThan(0.95)
  })
})

describe('grabbed', () => {
  it('is any steering key, but not boost alone', () => {
    expect(grabbed(IDLE)).toBe(false)
    expect(grabbed({ ...IDLE, boost: true })).toBe(false)
    expect(grabbed({ ...IDLE, thrust: 1 })).toBe(true)
    expect(grabbed({ ...IDLE, turn: -1 })).toBe(true)
  })
})

describe('pilot', () => {
  it('follows the trip until a key is pressed, then the keys', () => {
    const craft = launch(new Vector3(60, 0, 0), new Vector3(-1, 0, 0))
    const trip = plan(craft, star, 5)
    expect(pilot(craft, trip, IDLE, 1 / 60, () => 1)).toBe(trip)
    expect(
      pilot(craft, trip, { ...IDLE, thrust: 1 }, 1 / 60, () => 1),
    ).toBeNull()
    expect(craft.velocity.length()).toBeGreaterThan(0)
  })
})
