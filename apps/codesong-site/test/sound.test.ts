import { describe, expect, it } from 'vitest'
import { GENRE_NAMES } from '@codedocs/codesong/browser'
import { GENRE_SOUND } from '../src/audio/genres.ts'
import { controls, defaults, SETTINGS } from '../src/audio/sound.ts'

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
      expect(defaults(role, 'lofi')).toMatchObject({ volume: 0, pan: 0 })
  })
})

describe('GENRE_SOUND', () => {
  for (const genre of GENRE_NAMES) {
    it(`${genre}: changes only settings a role has, within their controls`, () => {
      for (const [role, sound] of Object.entries(GENRE_SOUND[genre].sounds)) {
        const settings = Object.assign(
          {},
          ...Object.values(SETTINGS[role as keyof typeof SETTINGS]),
        )
        for (const [key, value] of Object.entries(sound)) {
          const setting = settings[key]
          expect(setting, `${role}.${key}`).toBeDefined()
          if ('options' in setting) expect(setting.options).toContain(value)
          else {
            expect(value).toBeGreaterThanOrEqual(setting.min)
            expect(value).toBeLessThanOrEqual(setting.max)
          }
        }
      }
    })
  }

  it('lays a genre over the role defaults', () => {
    expect(defaults('bass', 'dnb')).toMatchObject({ wave: 'sine', volume: 0 })
    expect(defaults('bass', 'lofi').wave).toBe('triangle')
  })
})

describe('controls', () => {
  it('opens at the values a track was left at, and the defaults elsewhere', () => {
    const groups = controls('bass', { attack: 0.5, wave: 'sine' })
    expect(groups.Envelope!.attack!.value).toBe(0.5)
    expect(groups.Envelope!.release!.value).toBe(0.2)
    expect(groups.Oscillator!.wave!.value).toBe('sine')
  })

  it('keeps each value the kind its control expects', () => {
    const groups = controls('lead', { attack: '0.3' })
    expect(groups.Envelope!.attack!.value).toBe(0.3)
  })
})
