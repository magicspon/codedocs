import { Color } from 'three'

/**
 * Star temperatures, hot to cool, with how common each is. Real skies are
 * mostly cool dim stars with the odd hot bright one.
 */
const TEMPERATURES: readonly (readonly [Color, number])[] = [
  [new Color('#a8bdff'), 0.08],
  [new Color('#e4ecff'), 0.17],
  [new Color('#fff4e6'), 0.3],
  [new Color('#ffd9a8'), 0.27],
  [new Color('#ffb07a'), 0.18],
]
/** How far a star leans to its temperature; past this its kind stops reading. */
const WARMTH = 0.3

/** A star's colour and point size. */
export interface StarLook {
  readonly color: Color
  readonly size: number
}

/**
 * How one symbol star looks: its kind's colour, leant towards a star
 * temperature, at a brightness drawn from a steep curve so most stars are
 * faint and a few blaze. Bright stars are also larger and lean hotter, as in
 * a real sky. `rank` is `0` for the file with the most pull, and dims the crowded core.
 */
export function starLook(
  kind: Color,
  rank: number,
  random: () => number,
): StarLook {
  // Cubed, so the bright tail is rare: about one star in ten passes 0.45.
  const blaze = random() ** 3
  let pick = random()
  let temperature = TEMPERATURES[TEMPERATURES.length - 1]![0]
  for (const [c, share] of TEMPERATURES) {
    if ((pick -= share) < 0) {
      temperature = c
      break
    }
  }
  const color = kind
    .clone()
    .lerp(temperature, WARMTH)
    .lerp(TEMPERATURES[0]![0], blaze * 0.35)
    .multiplyScalar((0.12 + random() * 0.3 + blaze * 1.1) * (0.4 + 0.6 * rank))
  return {
    color,
    size: 0.08 + random() * 0.16 + blaze * 0.45,
  }
}
