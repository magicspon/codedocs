import type { GalaxyShape } from './galaxy-shape.ts'

/** Each shape in plain words: what it is, and what in the code made it. */
const NOTES: Record<GalaxyShape, string> = {
  spiral:
    'A spiral: the folders split the code evenly. Each arm is a top-level folder.',
  barred:
    'A barred spiral: a few files hold most of the code together. They form the bar, and folders wind out from its ends as arms.',
  elliptical:
    'An elliptical: nearly all the code leans on a few files, so it forms one smooth ball round them.',
  irregular:
    'An irregular: most code sits outside the main folders, so each folder is a clump of its own.',
}

/** One line saying which shape the galaxy is, and why. */
export function shapeNote(shape: GalaxyShape): string {
  return NOTES[shape]
}
