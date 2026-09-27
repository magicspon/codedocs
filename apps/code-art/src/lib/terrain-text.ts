/**
 * What the terrain shows, in plain words, one line per shape. Kept apart from
 * the overlay so the wording can be read and changed in one place.
 */
export const TERRAIN_LEGEND: readonly (readonly [
  shape: string,
  meaning: string,
])[] = [
  [
    'Ranges',
    'The bright block at the centre is the root of the repository. Each folder fans out from it, and each top-level folder takes its own band of colour.',
  ],
  [
    'Peaks',
    'Each file is a peak. The more symbols a file declares, the taller its peak. Test files sink into small lakes.',
  ],
  [
    'Rivers',
    'Calls run as rivers along the folder tree. Where folders call each other a lot, the rivers join into bright trunks. Faint veins are parts of the tree that no call uses.',
  ],
  ['Beacons', 'Beacons stand over the files that other files call most.'],
  ['Timelines', 'In a timeline, each file is drawn at its largest.'],
]
