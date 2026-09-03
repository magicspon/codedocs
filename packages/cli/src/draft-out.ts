/**
 * Where a draft lands, and what codedocs refuses to do to get it there.
 *
 * [ADR 0013](../../../docs/adr/0013-drafting-a-document.md) gives `docs draft` a
 * derived default rather than stdout: a draft is a file about to be edited, and
 * the place to edit it is beside the code it is about. So a subject that names a
 * symbol drafts `<dir>/docs/<file>.<symbol>.md`, next to the file that declares
 * it, and `--out` still overrides it.
 *
 * The refusal to overwrite is what makes the default safe, and it is unchanged:
 * an existing file is refused with the draft still on stdout, so nothing is lost
 * by the refusal.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, resolve } from 'node:path'

import {
  splitShorthand,
  type DraftSection,
  type EnvelopeError,
} from '@codedocs/core'

import { codedocsFrames, messageOf } from './stack.ts'

/** The directory a derived draft goes in, made if it is not there yet. */
const FOLDER = 'docs'

/**
 * The path a draft takes when `--out` named none.
 *
 * Derived from the **first** section, which is the one the subject named: a file
 * subject opens with its own section and a symbol subject has only its own, so
 * the first is the subject in both cases and the later sections are what the
 * index found inside it. An ambiguous subject drafts one file, named after the
 * first match — and the note beside it already reports the ambiguity.
 *
 * Repository-relative, because a section's subject is: `--cwd` names the
 * repository being drafted about, and the file belongs beside the code it
 * describes rather than beside the shell that asked for it. That is the one
 * place a derived path and an `--out` path differ.
 *
 * @returns The absolute path, or `null` where there is no section to derive from.
 */
export function derivedDraftPath(
  sections: readonly DraftSection[],
  root: string,
): string | null {
  const first = sections[0]
  if (first === undefined) return null
  const [path, dotted] = splitShorthand(first.subject)
  const stem = basename(path, extname(path))
  const named = dotted === '' ? stem : `${stem}.${dotted}`
  return resolve(root, dirname(path), FOLDER, `${segment(named)}.md`)
}

/** Every character a file name may not carry, on any platform codedocs runs on. */
const UNSAFE = /[/\\<>:"|?*]+/g

/**
 * One path segment, out of a name that was never meant to be one.
 *
 * A [[Descriptor path]] segment is what the author wrote, and an object-literal
 * key can be a string holding a slash — so a symbol name is not a file name
 * until the separators are out of it, or codedocs would derive a directory out
 * of somebody's string literal and then create it. Only what a path or a
 * platform forbids is replaced: a symbol called `café` drafts a file named
 * after it.
 */
const segment = (name: string): string => name.replaceAll(UNSAFE, '-')

/**
 * Write the draft, or say why it was not written.
 *
 * @param out - The path as the note and any refusal should spell it, which is
 * what the user typed where they typed one.
 * @param derived - Whether codedocs chose the path. Only then is the parent
 * directory created: a path codedocs derived includes a folder it is entitled to
 * make, while an `--out` that names a directory nobody made is a typo worth
 * hearing about rather than a tree worth creating.
 */
export function writeDraft(
  path: string,
  out: string,
  markdown: string,
  derived: boolean,
): EnvelopeError | null {
  if (existsSync(path)) return { code: 'draft-exists', params: { out } }
  try {
    if (derived) mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, markdown)
  } catch (error) {
    return {
      code: 'draft-unwritable',
      params: { out, detail: messageOf(error) },
      stack: codedocsFrames(error),
    }
  }
  return null
}
