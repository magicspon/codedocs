# The city (archived)

The city scene, taken out of the viewer so work can focus on the galaxy. Every
file keeps the path it had under `apps/code-art/`, and its imports are
unchanged, so restoring it is a move back:

1. Move `src/` and `test/` from here back into `apps/code-art/`.
2. Add `city: City` to `SCENES` and `city: 0.9` to `BLOOM` in `src/Stage.tsx`.
3. Put the city's wording back from `src/city-text.ts`: its legend into
   `LEGENDS` in `src/Controls.tsx`, its lens text into `LENS` in
   `src/lib/health-text.ts`. Then delete `city-text.ts`.
4. Put the city tests that were cut from the `layouts`, `series` and `health`
   tests back. They are kept in `test/city.test.ts`.
5. Put the city's sections back into `apps/code-art/README.md` from the notes
   below.

`src/lib/city-health.ts` holds the helpers that were cut from
`src/lib/health.ts` because only the city used them.

Nothing here is built, type-checked, linted or tested. The folder is outside
`tsconfig.json`'s `include`, and excluded from vitest, oxlint and fallow.

## What the city drew

These notes were cut from `apps/code-art/README.md` when the city was archived.

Away from the lens, the city is built from the index alone, on the galaxy's
own terms: every file is a **settlement**, standing on its directory's
district exactly as a building used to.

| Shape              | Reading                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Settlement tier    | population (symbols declared): a village if there are few, a town if there are plenty, a city if it is both symbol-dense and well connected |
| Buildings          | the settlement's own symbols, scattered from its `kinds` counts the way the galaxy scatters stars, laid out as a small street               |
| Building footprint | the symbol's kind: classes and namespaces stand wider than functions and variables                                                          |
| Building height    | the kind, scaled by how much of the codebase calls and references the file -- two files with the same population read as different skylines |
| Building colour    | the shell is the file's role tinted by project; a lit building glows its own kind's colour                                                  |
| Lit buildings      | calls and references touching the file, per symbol; a file nothing reaches keeps only its stairwell light                                   |
| Landmark mast      | calls arriving from other files, on the settlement's tallest building                                                                       |
| Arcs               | the heaviest call routes, with light travelling along them                                                                                  |

A settlement's buildings pop in as its file gains symbols, the way the
galaxy's stars do, rather than one tower growing taller. Seen from far enough
away a settlement's buildings average into a wash rather than shimmering.

- Point at a file to see fallow's numbers for it in the file panel.

### Under the health lens

| Reading        | City                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| Hotspot        | a pillar of warning light on the settlement's landmark, taller and redder as it heats; its buildings flush red |
| Heating up     | a pulse climbs the pillar and the buildings throb                                                              |
| Cooling        | the pillar burns low and greys towards smoke                                                                   |
| Unused file    | the buildings go dark and the shells cool to concrete                                                          |
| Hard to change | the shells rust                                                                                                |
| Whole repo     | the air thickens with smog and the stars go out                                                                |

- Rust starts at a maintainability of 85 and is full at 50. Real files sit
  between about 50 and 99, and a healthy repo's worst file lands near 85.
- The weather is the one reading no single building gives. It averages every
  file's heat, wear and unreachability, and a repository where a tenth of the
  files are fully in trouble reads as half choked. A city can raise only a few
  pillars and still be hard to breathe in.

### When a search finds one file

The camera flies up over the rooftops and down to the settlement. A band of
light climbs it and turns on every building it passes, shortest first.
