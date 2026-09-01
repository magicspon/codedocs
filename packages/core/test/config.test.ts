/**
 * `codedocs.jsonc`: what it accepts, and what it refuses to guess at.
 *
 * ADR 0010's whole bet is that strict beats lenient — a config that parses,
 * does nothing, and says nothing about either is the failure worth an error —
 * so most of these cases are the refusals.
 */

// cspell:ignore exlucde projekts — deliberate typos; refusing them is the point

import { describe, expect, it } from 'vitest'

import {
  ConfigError,
  DEFAULT_CONFIG,
  parseConfig,
  remediationFor,
} from '../src/config/index.ts'

/** The message of the `ConfigError` a bad config raises. */
function refusal(text: string): string {
  try {
    parseConfig(text)
  } catch (error) {
    if (error instanceof ConfigError) return error.message
    throw error
  }
  throw new Error('expected the config to be refused')
}

describe('parseConfig', () => {
  it('reads an empty object as the defaults', () => {
    expect(parseConfig('{}')).toEqual(DEFAULT_CONFIG)
  })

  it('reads comments and trailing commas, which is what `.jsonc` promises', () => {
    const config = parseConfig(`{
      // the fixture checkouts are not ours to analyse
      "discover": {
        "skip": ["repos"], /* block comments too */
      },
    }`)

    expect(config.discover.skip).toEqual(['repos'])
  })

  it('keeps a // that is inside a string', () => {
    const config = parseConfig('{"discover":{"skip":["a//b"]}}')

    expect(config.discover.skip).toEqual(['a//b'])
  })

  it('reads every key at once', () => {
    const config = parseConfig(`{
      "version": 1,
      "classify": { "vendor/**": { "authorship": "generated" } },
      "baselines": 0,
      "discover": { "projects": ["packages/*/tsconfig.build.json"], "skip": ["repos"] },
      "remediations": [{ "specifier": "@calcom/prisma/*", "run": "pnpm prisma generate" }]
    }`)

    expect(config).toEqual({
      version: 1,
      classify: [{ glob: 'vendor/**', role: null, authorship: 'generated' }],
      baselines: 0,
      discover: {
        projects: ['packages/*/tsconfig.build.json'],
        skip: ['repos'],
      },
      remediations: [
        { specifier: '@calcom/prisma/*', run: 'pnpm prisma generate' },
      ],
    })
  })

  it('names the file, the key and what was expected', () => {
    expect(refusal('{"baselines": "three"}')).toBe(
      'codedocs.jsonc: `baselines` must be a non-negative integer, got `"three"`',
    )
  })

  it('refuses an unknown key, naming a near neighbour where there is one', () => {
    expect(refusal('{"discovery": {}}')).toContain('did you mean `discover`?')
  })

  it('names the valid keys where nothing is close', () => {
    // The real transposition from the grilling thread. `exclude` is not a key,
    // and its nearest valid neighbour is `discover.skip` — which no top-level
    // suggestion can reach — so guessing would send the user somewhere wrong.
    const message = refusal('{"exlucde": ["node_modules"]}')

    expect(message).toContain('`exlucde` is not a key codedocs knows')
    expect(message).not.toContain('did you mean')
    expect(message).toContain('`discover`')
  })

  it('refuses an unknown key nested inside a known block', () => {
    expect(refusal('{"discover": {"projekts": []}}')).toContain(
      'discover.projekts` is not a key codedocs knows — did you mean `projects`?',
    )
  })

  it('refuses a classify value outside ADR 0003’s axes', () => {
    expect(refusal('{"classify": {"a/**": {"role": "fixture"}}}')).toContain(
      'must be one of `source`, `test`, `config`, got `"fixture"`',
    )
  })

  it('refuses a classify rule that sets neither axis', () => {
    expect(refusal('{"classify": {"a/**": {}}}')).toContain(
      'must set `role`, `authorship` or both',
    )
  })

  it('refuses remediations as an object, because order is the precedence', () => {
    expect(refusal('{"remediations": {"a": "b"}}')).toContain(
      'must be an array — order is the precedence',
    )
  })

  it('refuses a negative baselines count', () => {
    expect(refusal('{"baselines": -1}')).toContain('non-negative integer')
  })

  it('refuses text that is not JSONC at all', () => {
    expect(refusal('{ nope }')).toContain(
      'codedocs.jsonc: the file is not valid',
    )
  })
})

describe('remediationFor', () => {
  const config = parseConfig(`{
    "remediations": [
      { "specifier": "@calcom/prisma/enums", "run": "pnpm prisma generate --enums" },
      { "specifier": "@calcom/prisma/*", "run": "pnpm prisma generate" },
      { "specifier": "types/**", "run": "yarn rw g types" }
    ]
  }`)

  it('takes the first match, so a narrow entry can sit above a broad one', () => {
    expect(
      remediationFor(config, 'missing-generated', '@calcom/prisma/enums'),
    ).toBe('pnpm prisma generate --enums')
    expect(
      remediationFor(config, 'missing-generated', '@calcom/prisma/client'),
    ).toBe('pnpm prisma generate')
  })

  it('stops `*` at a separator and lets `**` cross one', () => {
    expect(
      remediationFor(config, 'missing-generated', '@calcom/prisma/a/b'),
    ).toBeNull()
    expect(remediationFor(config, 'missing-generated', 'types/gql/index')).toBe(
      'yarn rw g types',
    )
  })

  it('is consulted for `missing-generated` alone', () => {
    // ADR 0010: `unprepared`'s command comes from the lockfile, and `unmapped`
    // and `broken` carry none — so an entry matching one is never consulted.
    expect(
      remediationFor(config, 'unprepared', '@calcom/prisma/enums'),
    ).toBeNull()
    expect(
      remediationFor(config, 'unmapped', '@calcom/prisma/enums'),
    ).toBeNull()
    expect(remediationFor(config, 'broken', '@calcom/prisma/enums')).toBeNull()
  })

  it('offers nothing where no entry matches, rather than guessing', () => {
    expect(remediationFor(config, 'missing-generated', 'react')).toBeNull()
    expect(
      remediationFor(DEFAULT_CONFIG, 'missing-generated', 'anything'),
    ).toBeNull()
  })
})
