import type { Legend } from './legend.ts'

/**
 * What the metro shows, in plain words, one line per shape. Kept apart from
 * the overlay so the wording can be read and changed in one place.
 */
export const METRO_LEGEND: Legend = [
  [
    'Driving',
    'W to drive, S to brake and reverse, A and D to steer. Hold Shift to go faster and slide round corners. V swaps between the driver’s seat and a view from behind. R takes you back to the start. Drag to look around. On a touch screen the autopilot drives, and you drag to look around.',
  ],
  [
    'Getting about',
    'P turns the autopilot on: it drives by road to the nearest pink ring road, then stays on it round the planet, until you press a key. N takes you to the next landmark, one of the files the rest of the code calls most.',
  ],
  [
    'Minimap',
    'The minimap, bottom left, always has the way you face at the top. Pink lines are ring roads, blue are avenues and grey are streets. Amber dots are the landmarks; one at the edge means a landmark further off in that direction. The building you face is picked out in yellow.',
  ],
  [
    'The planet',
    'The repository is a small planet. The root is at the north pole, where you start. Each folder spreads south from its parent, and each top-level folder has its own colour.',
  ],
  [
    'Buildings',
    'Each file is a building. The more symbols a file declares, the taller it is. The bigger the file, the wider it is. The name of the building you are facing shows at the top right, and a poster on the wall facing you lists what the file declares.',
  ],
  [
    'Shapes',
    'A building’s shape shows the kind of symbol the file declares most. Classes step back as they rise. Functions are eight-sided towers. Types taper to spires. Enums and namespaces climb in steps. Tests are low round pods, and config files are low blocks.',
  ],
  [
    'Windows',
    'The busier a file is, the more of its windows are lit. Calls in, calls out and references all count. A file that nothing uses stands dark.',
  ],
  [
    'Signs',
    'The files other files use most put their names up in lights, in the colour of the file’s main kind of symbol, the same colours as the stars in the galaxy. The busiest have a sign on the roof. Slender towers have a sign running up their side, which you read along the street. Other tall buildings carry a panel of glyphs.',
  ],
  [
    'Roads',
    'Avenues follow the folder tree out from the root. Streets run through a folder’s own files. Pink ring roads circle the planet.',
  ],
  [
    'Traffic',
    'Calls between files drive along the roads. White lights head towards the root, red lights head away from it. The more calls, the busier the lane. Busy lanes queue where they meet a junction, brake lights on.',
  ],
  [
    'Named cars',
    'On the roads round you, the heaviest calls drive as cars you can read: the function, method or variable making the call, over the export it calls, each with its file, and how many times. Where a repository was exported without symbol names, the cards show files only. Only the five nearest show their names. Blue cards name the sky lanes overhead the same way.',
  ],
  [
    'Sky lanes',
    'The busiest calls between files fly from roof to roof. The further apart the files, the higher the lane climbs.',
  ],
  [
    'Beams',
    'Beams of amber light rise from the files that other files call most. You can see them over the horizon, so you can steer by them.',
  ],
  [
    'Trouble',
    'Where fallow ran: hotspots flash red, hard-to-change files have grimy windows, dead code goes dark, and calls the analysis could not follow make the neon flicker. Generated files are holograms.',
  ],
  ['Timelines', 'In a timeline, each file is drawn at its largest.'],
]
