# CodeSong

## Overview

Build an experimental music system that turns the structure of a TypeScript codebase into music.

The core idea is:

> **Software architecture becomes musical structure.**

Given a TypeScript repository analysed by `codedocs`, CodeSong should be able to produce a playable musical composition for Ableton Live.

The system should eventually support two related modes:

1. **Generate** a new composition from the codebase.
2. **Remix** an existing musical composition using the codebase as the generative structure.

The first target repository should be VS Code.

The long-term goal is:

```bash
codesong .
```

to take an arbitrary TypeScript repository and produce a new piece of music.

A second mode should allow:

```bash
codesong remix . ./track
```

to transform an existing musical work according to the structure of the repository.

This is an experimental art project, not a developer productivity tool.

---

# Artistic premise

A large software system contains:

- hierarchy
- repetition
- dependency
- tension
- centrality
- cycles
- clusters
- depth
- interaction
- symmetry
- asymmetry

These are also useful concepts in music.

CodeSong explores whether the structural properties of software can become the rules of musical composition.

The intended result is not merely:

> "A program that makes random MIDI."

The goal is:

> **A piece of music whose character is derived from the architecture of a real codebase.**

Ideally, different repositories should produce perceptibly different music.

---

# High-level architecture

```text
                    TypeScript repository
                            │
                            ▼
                       codedocs
                            │
                     structural graph
                            │
                            ▼
                  ┌───────────────────┐
                  │  Musical Analysis │
                  │                   │
                  │ clusters          │
                  │ importance        │
                  │ relationships     │
                  │ hierarchy         │
                  │ motifs            │
                  └─────────┬─────────┘
                            │
                            ▼
                  ┌───────────────────┐
                  │     Composer      │
                  │                   │
                  │ harmony           │
                  │ melody            │
                  │ rhythm            │
                  │ arrangement       │
                  └─────────┬─────────┘
                            │
                            ▼
                  ┌───────────────────┐
                  │ Composition Model │
                  └─────────┬─────────┘
                            │
                    ┌───────┴────────┐
                    ▼                ▼
                 Generate           Remix
                    │                │
                    └───────┬────────┘
                            ▼
                    Ableton renderer
                            │
                            ▼
                       Ableton Live
                            │
                            ▼
                         Music
```

---

# Core architecture

The system should be divided into four major layers.

## 1. Code graph

Provided by `codedocs`.

This layer knows about software.

It contains things such as:

- projects
- packages
- directories
- files
- symbols
- symbol kinds
- references
- callers
- callees
- dependency relationships
- hierarchy
- graph topology

The CodeSong project should not need to understand TypeScript source code directly wherever `codedocs` can provide the required structural information.

---

## 2. Musical analysis

This layer translates the code graph into a smaller set of **musically meaningful structures**.

It should calculate things such as:

- fan-in
- fan-out
- depth
- centrality
- graph density
- dependency clusters
- repeated relationships
- cycles
- important paths
- hierarchy
- structural complexity

The output is not MIDI.

It is a musical interpretation of the codebase.

---

## 3. Composer

The composer turns the musical analysis into a **composition model**.

It determines:

- tempo
- key
- scale
- harmony
- motifs
- melodies
- rhythms
- instrumentation roles
- tracks
- sections
- arrangement
- transformations

The composer should remain independent from Ableton.

---

## 4. Renderer

The renderer converts the composition model into a concrete musical representation.

The initial target is Ableton Live.

Potential future targets include:

- MIDI
- Web Audio
- Tone.js
- Web MIDI
- OSC
- other DAWs

---

# Code graph → music

The system should not map every symbol directly to a note.

A repository containing tens of thousands of symbols cannot sensibly become tens of thousands of simultaneous musical events.

Instead:

```text
Code graph
    ↓
Structural reduction
    ↓
Musical structures
    ↓
Composition
```

---

# Structural mappings

Initial mappings should include:

| Code structure   | Musical interpretation |
| ---------------- | ---------------------- |
| Repository       | Composition            |
| Project/package  | Track or musical group |
| Directory        | Section                |
| File             | Phrase                 |
| Important symbol | Motif                  |
| Symbol kind      | Musical role           |
| Dependency edge  | Musical relationship   |
| Call graph       | Melody                 |
| Import graph     | Harmony                |
| Fan-in           | Importance             |
| Fan-out          | Complexity             |
| Depth            | Register/octave        |
| Graph density    | Intensity              |
| Cluster          | Harmonic group         |
| Repetition       | Repeated motif         |
| Cycle            | Loop/rhythm            |
| Central node     | Root/bass material     |
| Leaf node        | Ornament/percussion    |
| Dependency path  | Musical phrase         |

These mappings must remain configurable.

---

# Musical roles

The composer should not directly choose specific Ableton instruments based on source code.

Instead, code structures should first be assigned **musical roles**.

For example:

```text
highly central node
        ↓
     bass role
        ↓
 Ableton bass instrument
```

Possible roles:

- bass
- lead
- pad
- chord
- percussion
- texture
- arp
- drone
- pluck
- sequence

The composition model should describe musical intent:

```ts
type Track = {
  name: string
  role: MusicalRole
  register: Register
  character: MusicalCharacter
}
```

rather than:

```ts
instrument: 'AbletonPreset123'
```

The Ableton renderer decides how to realise the role.

This allows different instrument palettes and musical styles without changing the underlying code-to-music mapping.

---

# Instrument selection

Instrument selection should be deterministic but configurable.

A style can provide an instrument palette:

```text
ambient
  bass  → sub bass
  lead  → soft synth
  pad   → evolving pad
  texture → granular texture

techno
  bass  → synth bass
  lead  → digital synth
  pad   → chord stab
  percussion → drum machine
```

The composer chooses the **role**.

The renderer chooses the **instrument**.

A seed can be used to select between suitable instruments within a role.

Therefore:

```text
VS Code
  ↓
editor subsystem
  ↓
lead role
  ↓
techno palette
  ↓
synth lead
```

Changing the style changes the sound without changing the underlying composition.

---

# Motifs

Motifs should be a central abstraction.

A motif represents a musical idea derived from a structural relationship.

For example:

```text
Editor
   ↓
TextModel
   ↓
Commands
   ↓
Files
```

could produce a motif such as:

```text
C4 → Eb4 → G4 → Bb4
```

The exact pitches are less important than the structural relationship.

The composer should be able to transform motifs through:

- transposition
- inversion
- repetition
- fragmentation
- expansion
- contraction
- rhythmic variation
- orchestration

This allows the same important code structure to recur throughout the composition.

---

# Musical analysis

The composer should identify structurally interesting features.

## Highly connected nodes

A highly connected node can become a musical anchor.

Possible interpretations:

- bass/root
- recurring motif
- strong rhythmic event
- harmonic centre

## Dependency chains

Long chains can become melodic phrases.

```text
A → B → C → D → E
```

can become:

```text
C → E → G → B → D
```

## Dense clusters

Dense clusters can become:

- chords
- harmonic sections
- dense rhythmic passages
- orchestral layers

## Cycles

Cycles can become:

- ostinatos
- loops
- repeated rhythms
- arpeggios

## Repetition

Repeated structural patterns can become recurring musical motifs.

---

# Arrangement

The repository hierarchy should influence the musical arrangement.

For example:

```text
platform
editor
workbench
extensions
```

could become:

```text
INTRO
  platform

SECTION 1
  editor

CHORUS
  workbench

BREAKDOWN
  extensions

OUTRO
  platform/editor resolution
```

The exact arrangement should be generated rather than hard-coded.

Structural characteristics can influence:

- section length
- intensity
- instrumentation
- density
- harmonic tension
- transitions
- climax

The result should feel like a composition rather than a stream of generated notes.

---

# Musical constraints

The code graph should provide the variation, while musical rules provide coherence.

The composer should constrain output using:

- key
- scale
- harmonic rules
- rhythmic quantisation
- register
- phrase length
- maximum density
- repetition
- tension/release

For example, a graph-derived numerical value should not directly become an arbitrary MIDI pitch.

Instead:

```text
graph value
    ↓
normalisation
    ↓
musical range
    ↓
scale quantisation
    ↓
note
```

This allows structural information to influence music without destroying musicality.

---

# Normalisation

The system must handle repositories of radically different sizes.

A small library might contain:

```text
300 symbols
```

while VS Code might contain:

```text
tens of thousands of symbols
```

The duration and complexity of the composition should not scale linearly with symbol count.

Instead:

```text
repository
    ↓
graph
    ↓
normalisation
    ↓
complexity budget
    ↓
composition
```

The composition should have configurable limits such as:

- duration
- maximum tracks
- maximum simultaneous voices
- maximum motif count
- maximum rhythmic density

---

# Determinism

Composition should be reproducible.

The output should be determined by:

```text
repository graph
+
composer version
+
composition configuration
+
seed
```

The same inputs should produce the same composition.

Changing only the seed should produce a controlled variation.

For example:

```bash
codesong . --seed 1234
codesong . --seed 5678
```

should produce different musical interpretations while retaining the structural identity of the repository.

---

# Composition model

The composer should output an intermediate representation.

For example:

```ts
type Composition = {
  tempo: number
  key: Key
  scale: Scale

  tracks: Track[]
  motifs: Motif[]
  sections: Section[]
}
```

A track might contain:

```ts
type Track = {
  id: string
  name: string
  role: MusicalRole
  motifs: MotifReference[]
}
```

A motif should retain provenance:

```ts
type Motif = {
  id: string

  source: {
    project?: string
    file?: string
    symbols: string[]
  }

  notes: Note[]
  rhythm: Rhythm
}
```

This is important because every musical event should ultimately be traceable back to the code that produced it.

---

# Generate mode

The simplest workflow should be:

```bash
codesong .
```

The command should:

1. Locate the repository.
2. Run or consume `codedocs` analysis.
3. Build the structural graph.
4. Analyse the graph.
5. Generate a musical composition.
6. Render it into a target format.
7. Produce an Ableton project and/or MIDI.

Example:

```text
Analysing repository...
  4,827 files
  48,069 symbols
  26,091 relationships

Analysing structure...
  37 clusters
  184 important symbols
  62 dependency paths
  19 motifs

Composing...
  8 tracks
  14 motifs
  31 sections
  8:42 duration

Rendering Ableton project...

✓ codesong.als
✓ codesong.json
✓ codesong.mid
```

---

# Remix mode

The second major capability is to use an existing piece of music as the musical source material.

Conceptually:

```text
Existing track
       │
       ▼
Musical analysis
       │
       ├── tempo
       ├── key
       ├── harmony
       ├── rhythm
       ├── motifs
       ├── instrumentation
       └── arrangement
       │
       ▼
   Musical genome
       │
       ▲
       │
 codedocs graph
       │
       ▼
Structural transformation
       │
       ▼
      Remix
```

The existing track provides musical vocabulary.

The repository determines how that vocabulary is transformed.

---

# Existing track analysis

Where possible, the remix system should work from structured musical sources such as:

- MIDI
- Ableton Live projects
- separated stems
- project files
- other machine-readable musical representations

Audio-only input can be supported later, but structured input should be preferred.

Extractable characteristics include:

- BPM
- key
- scale
- chord progression
- rhythm
- motifs
- phrase lengths
- instrumentation
- arrangement
- energy
- track relationships

---

# Musical genome

The existing track should be represented as a reusable musical model.

For example:

```ts
type MusicalGenome = {
  tempo: number
  key: Key
  scale: Scale

  harmony: Harmony[]
  rhythms: Rhythm[]
  motifs: Motif[]
  instruments: InstrumentRole[]
  arrangement: Section[]
}
```

The repository then modifies or controls these structures.

---

# Code-driven remix

For example:

```text
Existing track
  ├── bass
  ├── drums
  ├── pad
  └── lead

VS Code
  ├── platform
  ├── editor
  ├── workbench
  └── extensions
```

could map to:

```text
platform    → bass
editor      → lead
workbench   → pad
extensions  → percussion
```

But the important part is not merely assigning tracks.

Structural properties should modify the musical material.

For example:

```text
graph centrality
    ↓
bass prominence

dependency depth
    ↓
melodic register

graph density
    ↓
rhythmic density

cluster transitions
    ↓
arrangement transitions

repeated dependency patterns
    ↓
motif repetition
```

The original song provides the musical DNA.

The codebase determines how that DNA is transformed.

---

# Remix principle

The remix system should preserve some recognisable characteristics of the source while introducing structural variation based on the repository.

The goal is:

```text
original musical identity
          +
codebase structural identity
          =
new composition
```

rather than simply placing arbitrary code-generated MIDI over an existing song.

---

# Ableton integration

Ableton Live should be the primary production environment.

The project should use official Ableton-supported APIs/SDK mechanisms wherever possible.

The Ableton integration should be responsible for:

- creating tracks
- creating MIDI clips
- inserting MIDI notes
- assigning instruments
- configuring effects
- setting tempo
- arranging clips
- controlling transport
- triggering playback
- exposing playback state

The composer itself should remain Ableton-independent.

---

# Existing Ableton bridge

An existing Node/Ableton bridge can be used for live communication.

The current system already exposes concepts such as:

```text
is_playing
tempo
song_position
```

This should eventually allow:

```text
Ableton
   ↓
Node
   ↓
visualisation
```

while generated musical data flows:

```text
codedocs
   ↓
composer
   ↓
Node
   ↓
Ableton
```

---

# Visualisation

The same composition should eventually drive an audiovisual representation.

React Three Fiber is a suitable implementation.

The visualisation should be generative art rather than a traditional dependency graph.

For example:

```text
Code graph
    ↓
3D structures
    ↓
movement
    ↓
music synchronisation
```

During playback:

- active code structures react
- important symbols have greater visual presence
- dependency paths propagate through the graph
- rhythm controls movement
- harmonic events affect large-scale geometry
- different sections produce different visual states

The music and visualisation should therefore be two outputs of the same composition model.

---

# CLI

The initial interface should be extremely simple.

## Generate

```bash
codesong .
```

## Generate with seed

```bash
codesong . --seed 1234
```

## Select style

```bash
codesong . --style ambient
codesong . --style techno
codesong . --style orchestral
```

## Control duration

```bash
codesong . --duration 10m
```

## Remix

```bash
codesong remix . ./track.mid
```

## Open the generated Ableton project

```bash
codesong . --open
```

The default path should require no configuration.

---

# Repository compatibility

The goal is to support any TypeScript repository that `codedocs` can analyse.

The composer must therefore tolerate:

- small libraries
- large applications
- monorepos
- framework repositories
- generated code
- unusual project structures
- incomplete projects
- repositories with very different graph shapes

Where a repository cannot be analysed completely, the system should report the limitation rather than silently inventing structure.

---

# Style system

Musical styles should be configuration rather than separate composition engines.

For example:

```text
Composition
     │
     ├── ambient style
     ├── techno style
     ├── orchestral style
     ├── IDM style
     └── generative style
```

The code-derived composition should remain broadly the same while:

- instrumentation
- rhythm
- sound palette
- tempo
- arrangement conventions
- effects

can change.

This allows the same repository to produce multiple musical interpretations.

**Built (composer 0.5.0).** Five genres live in `apps/codesong/src/compose/genre.ts`: ambient,
lo-fi hip hop, techno, drum and bass and jazz. Each sets the tempo, scale, swing (on eighths or
sixteenths), a section-length multiplier (so fast genres last about as long as slow ones), whether
chords always carry the seventh, a drum style, a bass style, a melody speed and the roles that rest
in each kind of section. The code still decides the key, chords, melodies, form and how many drum
hits there are.

The code suggests a genre from two measures. Energy is the mean dependencies per file inside each
subsystem, weighted by size (busy from 2.5). Tangle is the share of files in a dependency cycle
(tangled from 15%, knotted from 35%). Knotted code is jazz; otherwise calm and orderly is ambient,
calm and tangled lo-fi, busy and orderly techno, busy and tangled drum and bass. `compose --genre
name` overrides it. The site's `<name>.song.json` holds the piece in every genre, so a listener can
switch while it plays; the switch keeps the same place in the same section. The browser sound for
each genre is in `apps/codesong-site/src/audio/genres.ts`. The Live palette is still one for every
genre.

---

# Development phases

## Phase 1: Prove the concept

Input:

```text
small TypeScript repository
```

Output:

```text
composition.json
MIDI
```

Use only a few structural properties:

- centrality
- fan-in
- fan-out
- depth
- dependency paths

Use:

- one key
- one scale
- fixed tempo
- 2-4 tracks
- short duration

The question is simply:

> Can the structural graph produce something that sounds like music?

---

## Phase 2: VS Code

Run against the full VS Code repository.

Introduce:

- clusters
- motifs
- hierarchy
- multiple tracks
- arrangement
- more sophisticated rhythm
- harmonic structure

The output should be a complete composition.

---

## Phase 3: Ableton

Generate a real Ableton project.

Support:

- tracks
- MIDI clips
- instruments
- effects
- arrangement
- automation where useful

---

## Phase 4: Multiple repositories

Test:

- VS Code
- TypeScript
- Angular
- Deno
- Cal.com
- Solid
- other large TypeScript repositories

The objective is to establish that different codebases produce different musical identities.

---

## Phase 5: Remix

Add:

- MIDI input
- structured musical analysis
- musical genome
- code-driven transformation
- Ableton remix output

---

## Phase 6: Audiovisual performance

Connect Ableton playback to the R3F visualisation.

The final experience becomes:

```text
                Repository
                    │
                 codedocs
                    │
                 Composer
                    │
          ┌─────────┴─────────┐
          │                   │
       Ableton               R3F
          │                   │
        Music              Visuals
          │                   │
          └─────────┬─────────┘
                    │
                Performance
```

---

# Success criteria

The project succeeds if:

1. `codesong .` can turn a real TypeScript repository into a playable composition.
2. The process requires no manual musical configuration for the default case.
3. The output is deterministic.
4. Different repositories produce perceptibly different music.
5. The music remains musically coherent.
6. Musical elements can be traced back to code structures.
7. The same composition can be rendered independently of Ableton.
8. Ableton can render the composition as a normal editable project.
9. Existing music can be analysed and remixed using repository structure.
10. The resulting work feels like generative art derived from software architecture rather than a developer tool with sound added.

---

# Core principle

The system should maintain this separation throughout development:

```text
CODE

What exists?
What depends on what?
What is important?
What is repeated?
What is central?
What is deep?
        │
        ▼
MUSICAL ANALYSIS

What are the motifs?
What are the sections?
What are the relationships?
What is the rhythm?
What is the harmonic structure?
        │
        ▼
COMPOSITION

What should happen when?
What should repeat?
What should develop?
What should become prominent?
        │
        ▼
RENDERING

How should this composition be realised?
        │
        ├── Ableton
        ├── MIDI
        └── Web Audio
```

The fundamental idea is:

> **`codedocs` describes the software. CodeSong interprets that structure as music. Ableton performs it.**
