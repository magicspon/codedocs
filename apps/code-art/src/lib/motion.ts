import type { Transition, Variants } from 'motion/react'

/**
 * The overlay's shared motion, so every panel moves the same way. A spring
 * rather than a curve: panels open on a key press as often as a click, and a
 * spring picks up cleanly when one is toggled again mid-flight.
 */
export const SPRING: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 32,
}

/**
 * A panel that grows out of its button and shrinks back into it on close.
 * `from` is where it starts, relative to where it rests: `{ y: -10 }` drops it
 * down from above, `{ x: -10 }` slides it out to the right.
 */
export function panel(from: { x?: number; y?: number }): Variants {
  const x = from.x ?? 0
  const y = from.y ?? 0
  return {
    hidden: { opacity: 0, x, y, scale: 0.96, filter: 'blur(4px)' },
    shown: {
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
      filter: 'blur(0px)',
      transition: SPRING,
    },
    // Leaves faster than it came, so a closed panel never lingers over the art.
    gone: {
      opacity: 0,
      x: x * 0.6,
      y: y * 0.6,
      scale: 0.98,
      filter: 'blur(4px)',
      transition: { duration: 0.14, ease: 'easeIn' },
    },
  }
}

/**
 * `variants` whose children arrive one after another, and leave in reverse.
 * Children take their states from `ITEM`.
 */
export function staggered(variants: Variants): Variants {
  const { shown, gone } = variants as Record<
    'shown' | 'gone',
    { transition?: Transition }
  >
  return {
    ...variants,
    shown: {
      ...shown,
      transition: {
        ...shown.transition,
        staggerChildren: 0.04,
        delayChildren: 0.05,
      },
    },
    gone: {
      ...gone,
      transition: {
        ...gone.transition,
        staggerChildren: 0.02,
        staggerDirection: -1,
      },
    },
  }
}

/** One child of a `staggered` parent. */
export const ITEM: Variants = {
  hidden: { opacity: 0, y: 6 },
  shown: { opacity: 1, y: 0, transition: SPRING },
  gone: { opacity: 0, y: 4, transition: { duration: 0.1 } },
}
