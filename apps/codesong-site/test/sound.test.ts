import { describe, expect, it } from 'vitest'
import { defaults, SETTINGS } from '../src/audio/sound.ts'

describe('SETTINGS', () => {
  for (const [role, groups] of Object.entries(SETTINGS)) {
    it(`${role}: every key is unique across groups`, () => {
      // Leva and `defaults` flatten the groups, so a repeated key would clash.
      const keys = Object.values(groups).flatMap((g) => Object.keys(g))
      expect(new Set(keys).size).toBe(keys.length)
    })

    it(`${role}: every default sits within its control`, () => {
      for (const group of Object.values(groups))
        for (const setting of Object.values(group)) {
          if ('options' in setting)
            expect(setting.options).toContain(setting.value)
          else {
            expect(setting.value).toBeGreaterThanOrEqual(setting.min)
            expect(setting.value).toBeLessThanOrEqual(setting.max)
          }
        }
    })
  }

  it('gives every track a volume and a pan', () => {
    for (const role of Object.keys(SETTINGS) as (keyof typeof SETTINGS)[])
      expect(defaults(role)).toMatchObject({ volume: 0, pan: 0 })
  })
})
