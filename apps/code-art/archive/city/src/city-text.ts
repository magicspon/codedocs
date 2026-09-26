/**
 * The city's words, cut from the viewer when the city was archived. Restored,
 * `LEGEND` goes back into `LEGENDS` in `src/Controls.tsx` and `LENS` into
 * `LENS` in `src/lib/health-text.ts`, both under the key `city`.
 */

/** What the city maps, in one line. */
export const LEGEND = {
  city: 'Districts are folders. Every file is a settlement: a village if it declares few symbols, a town if it declares plenty, a city if it is both symbol-dense and well connected. Its buildings are its own symbols, coloured by kind and lit by the traffic through the file. A landmark mast glows with incoming calls.',
}

/** What the health lens draws in the city. */
export const LENS = {
  city: {
    hot: 'A pillar of warning light marks a hotspot settlement: taller and redder is hotter, and its buildings flush red. A pulse climbing the pillar means heating up; a low grey one means cooling.',
    unused:
      'Unlit, concrete-grey settlements are files no entry point reaches.',
    rest: 'Rust shows code that is hard to change, and the air thickens with smog as the whole repository does.',
  },
}
