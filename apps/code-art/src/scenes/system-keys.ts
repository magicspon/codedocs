import { useHotkeys } from '@tanstack/react-hotkeys'
import { useEffect } from 'react'
import {
  enter,
  leave,
  NO_CLAIMS,
  step,
  type SystemClaims,
  type SystemNav,
} from '../lib/system-nav.ts'

/**
 * Walks a file's system by keyboard. Shift ←→ picks out a body on the current
 * level, Shift ↓ zooms into it and Shift ↑ zooms out. Enter and Escape do the
 * same only while `claims` says so: otherwise they belong to the file's links,
 * whose keys stand aside on the same claims. Both sides register the key, so
 * each allows the other.
 */
export function useSystemKeys(
  enabled: boolean,
  nav: SystemNav,
  bodies: readonly number[],
  claims: SystemClaims,
  onNav: (nav: SystemNav) => void,
): void {
  const options = { enabled }
  useHotkeys([
    {
      hotkey: 'Shift+ArrowRight',
      callback: () => onNav(step(nav, bodies, 1)),
      options,
    },
    {
      hotkey: 'Shift+ArrowLeft',
      callback: () => onNav(step(nav, bodies, -1)),
      options,
    },
    {
      hotkey: 'Shift+ArrowDown',
      callback: () => onNav(enter(nav, bodies)),
      options,
    },
    { hotkey: 'Shift+ArrowUp', callback: () => onNav(leave(nav)), options },
    {
      hotkey: 'Enter',
      callback: () => onNav(enter(nav, bodies)),
      options: { enabled: enabled && claims.enter, conflictBehavior: 'allow' },
    },
    {
      hotkey: 'Escape',
      callback: () => onNav(leave(nav)),
      options: { enabled: enabled && claims.leave, conflictBehavior: 'allow' },
    },
  ])
}

/**
 * Tells the viewer which plain keys the system holds, and gives them back
 * when the system goes: a file put down, or the scene changed.
 */
export function useReportClaims(
  claims: SystemClaims,
  onClaims: ((claims: SystemClaims) => void) | undefined,
): void {
  const { leave, enter } = claims
  useEffect(() => onClaims?.({ leave, enter }), [leave, enter, onClaims])
  useEffect(() => () => onClaims?.(NO_CLAIMS), [onClaims])
}
