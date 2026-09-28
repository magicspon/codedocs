import { Vector3, type Group, type PerspectiveCamera } from 'three'
import type { Buggy } from '../lib/buggy.ts'
import type { Look } from './drag-look.ts'

/**
 * Where the camera sits on the buggy, and how the drawn buggy is posed,
 * worked out afresh each frame from the buggy's own axes.
 */

/** Which seat the camera takes. */
export type View = 'driver' | 'chase'

/** The driver's eye above the ground, and how far forward of the buggy's middle. */
const EYE = 1.35
const EYE_FORWARD = 0.55

/** Vectors reused every frame, and how hard the view is shaking. */
export interface ViewScratch {
  readonly up: Vector3
  readonly eye: Vector3
  readonly target: Vector3
  readonly side: Vector3
  shake: number
}

/** Fresh scratch vectors. */
export function viewScratch(): ViewScratch {
  return {
    up: new Vector3(),
    eye: new Vector3(),
    target: new Vector3(),
    side: new Vector3(),
    shake: 0,
  }
}

/** Sets the drawn buggy on the ground, nose forward, leaning a little into a turn. */
export function poseBody(g: Group, b: Buggy, s: ViewScratch): void {
  const speed = Math.abs(b.velocity.dot(b.forward))
  g.position.copy(b.position)
  g.up.copy(s.up)
  // An object's `lookAt` turns its back (+z) to the point; the model faces -z.
  g.lookAt(s.target.copy(b.position).sub(b.forward))
  g.rotateZ(-b.steer * Math.min(1, speed / 20) * 0.06)
}

/** The eye and what it looks at, for `view`, before any drag. */
function seat(view: View, b: Buggy, s: ViewScratch): void {
  const { up, eye, target } = s
  if (view === 'driver') {
    eye
      .copy(b.position)
      .addScaledVector(up, EYE)
      .addScaledVector(b.forward, EYE_FORWARD)
    target.copy(eye).addScaledVector(b.forward, 10).addScaledVector(up, -0.3)
    return
  }
  eye.copy(b.position).addScaledVector(b.forward, -7.5).addScaledVector(up, 3.2)
  target.copy(b.position).addScaledVector(b.forward, 6).addScaledVector(up, 1)
}

/**
 * Puts the camera in its seat, turned by the drag, shaken by a knock, and
 * widening its view with speed so going fast feels fast.
 */
export function aim(
  camera: PerspectiveCamera,
  view: View,
  b: Buggy,
  look: Look,
  s: ViewScratch,
  dt: number,
): void {
  const { up, eye, target, side } = s
  seat(view, b, s)
  side.crossVectors(b.forward, up)
  target
    .sub(eye)
    .applyAxisAngle(up, look.yaw)
    .applyAxisAngle(side, look.pitch)
    .add(eye)
  s.shake = Math.max(s.shake * Math.exp(-dt * 8), Math.min(1, b.bump / 10))
  eye.addScaledVector(side, (Math.random() - 0.5) * s.shake * 0.3)
  camera.position.copy(eye)
  camera.up.copy(up)
  camera.lookAt(target)
  const fov = 68 + Math.min(22, Math.abs(b.velocity.dot(b.forward)) * 0.45)
  if (Math.abs(camera.fov - fov) < 0.05) return
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 4)
  camera.updateProjectionMatrix()
}
