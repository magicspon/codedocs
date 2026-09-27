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
    'The root of the repository is at the centre, where the rivers meet. Each folder fans out from it, and each top-level folder takes its own band of colour.',
  ],
  [
    'Peaks',
    'Each file is a peak. The more symbols a file declares, the taller its peak. Test files sink into small lakes.',
  ],
  [
    'Rivers',
    'Calls run as rivers along the folder tree. Where folders call each other a lot, the rivers join into bright trunks. Faint veins are parts of the tree that no call uses.',
  ],
  [
    'Ripples',
    'Rings of amber light close in on the files that other files call most. The more calls a file gets, the brighter and wider its ripples.',
  ],
  [
    'Bands',
    'Coloured bands run up each peak, one for each kind of symbol, in the same colours as the stars in the galaxy. The thicker a band, the more symbols of that kind the file declares.',
  ],
  ['Timelines', 'In a timeline, each file is drawn at its largest.'],
]
