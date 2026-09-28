/**
 * The form of the piece, generated from the subsystems: foundations first,
 * the largest subsystem as the chorus, the loosest as the breakdown, and an
 * intro and outro built on the most foundational one.
 */

import type { Form, Section } from '../model.ts'
import type { Region } from '../regions.ts'
import { quantise } from '../theory.ts'

const BAR = 4
/** Sections are whole multiples of four bars, so phrases stay square. */
const UNIT = 4 * BAR

/**
 * Harmonic areas away from home, as scale-degree shifts: IV, V, then vi. A
 * subsystem that sits on top of the others gets the most tension.
 */
const AREAS = [0, 3, 4, 5]

/** A section before it is placed in time. */
export interface Planned {
  readonly region: Region
  readonly form: Form
  readonly units: number
  readonly intensity: number
  readonly area: number
}

/** Foundations first; among equals, the heavier subsystem leads. */
function order(regions: readonly Region[]): Region[] {
  return [...regions].sort(
    (a, b) =>
      b.foundation - a.foundation ||
      b.weight - a.weight ||
      a.path.localeCompare(b.path),
  )
}

/** Which verse is the chorus and which the breakdown. */
function roles(regions: readonly Region[]): Map<Region, Form> {
  const forms = new Map<Region, Form>(regions.map((r) => [r, 'verse']))
  const chorus = regions.reduce((a, b) => (b.share > a.share ? b : a))
  forms.set(chorus, 'chorus')
  // A breakdown needs verses either side of it to break from.
  if (regions.length >= 4) {
    const rest = regions.filter((r) => r !== chorus)
    forms.set(
      rest.reduce((a, b) => (b.density < a.density ? b : a)),
      'breakdown',
    )
  }
  return forms
}

/** The plan in playing order, before lengths are fitted to the bar budget. */
export function plan(regions: readonly Region[]): Planned[] {
  const ordered = order(regions)
  const forms = roles(ordered)
  const densest = Math.max(...ordered.map((r) => r.density), 1)
  const home = ordered[0]!
  const body = ordered.map((region): Planned => {
    const form = forms.get(region)!
    return {
      region,
      form,
      // Bigger subsystems play longer, but by the square root: a subsystem
      // ten times the size does not get ten times the time.
      units:
        form === 'chorus'
          ? 4
          : Math.min(3, Math.max(2, Math.round(Math.sqrt(region.share) * 6))),
      intensity:
        form === 'chorus'
          ? 1
          : form === 'breakdown'
            ? 0.35
            : 0.5 + 0.4 * (region.density / densest),
      area:
        form === 'chorus'
          ? 0
          : AREAS[quantise(1 - region.foundation, 0, AREAS.length - 1)]!,
    }
  })
  return [
    { region: home, form: 'intro', units: 2, intensity: 0.3, area: 0 },
    ...body,
    { region: home, form: 'outro', units: 2, intensity: 0.3, area: 0 },
  ]
}

/**
 * Places the plan in time. With a bar budget, every section is scaled to fit
 * it, though none drops below one unit. Without one, `stretch` lengthens
 * every section, so a fast genre plays about as long as a slow one.
 */
export function sections(
  planned: readonly Planned[],
  bars: number | 'auto',
  stretch = 1,
): Section[] {
  const natural = planned.reduce((sum, p) => sum + p.units, 0)
  const scale = bars === 'auto' ? stretch : (bars * BAR) / (natural * UNIT)
  let start = 0
  return planned.map((p) => {
    const length = Math.max(1, Math.round(p.units * scale)) * UNIT
    const section: Section = {
      name: p.form === 'intro' || p.form === 'outro' ? p.form : p.region.name,
      form: p.form,
      source: p.region.path,
      start,
      length,
      intensity: p.intensity,
      area: p.area,
    }
    start += length
    return section
  })
}
