/**
 * The landing page's night sky, drawn with the 2D canvas. Unlike the galaxy
 * it is pure decoration, so it is freshly random on every visit: nothing here
 * stands for data.
 */

/** A star in the twinkling layer, in CSS pixels. */
interface Star {
  x: number
  y: number
  r: number
  phase: number
  speed: number
  /** How far it slides with the pointer; nearer stars slide more. */
  depth: number
  tint: string
}

/** A shooting star: where it is, where it is heading, and how long it has left. */
interface Meteor {
  x: number
  y: number
  vx: number
  vy: number
  age: number
  life: number
}

/** A slow blinking dot crossing the sky. */
interface Satellite {
  x: number
  y: number
  vx: number
  vy: number
}

/** Everything the sky needs to draw one frame. */
export interface Sky {
  width: number
  height: number
  /** Nebulae, dust and the planet: drawn once per resize, then copied. */
  backdrop: HTMLCanvasElement
  stars: Star[]
  meteors: Meteor[]
  satellite: Satellite | null
}

const TINTS = ['#ffffff', '#cfe0ff', '#ffe6c7', '#bcd4ff', '#ffd1dc']

/** A float in `[lo, hi)`. */
function between(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo)
}

/** Soft coloured clouds, blended additively so overlaps glow. */
function paintNebulae(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  ctx.globalCompositeOperation = 'lighter'
  for (const hue of [265, 195, 330, 30]) {
    const x = between(0, w)
    const y = between(0, h)
    const r = between(0.35, 0.7) * Math.max(w, h)
    const cloud = ctx.createRadialGradient(x, y, 0, x, y, r)
    cloud.addColorStop(0, `hsl(${hue} 65% 45% / 22%)`)
    cloud.addColorStop(0.5, `hsl(${hue} 65% 30% / 8%)`)
    cloud.addColorStop(1, 'transparent')
    ctx.fillStyle = cloud
    ctx.fillRect(0, 0, w, h)
  }
  ctx.globalCompositeOperation = 'source-over'
}

/**
 * Nudges every pixel by a little noise. Wide, faint gradients show rings at
 * 8 bits a channel; grain breaks them up.
 */
function paintGrain(ctx: CanvasRenderingContext2D): void {
  const { width, height } = ctx.canvas
  const image = ctx.getImageData(0, 0, width, height)
  const data = image.data
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 6
    data[i] = (data[i] ?? 0) + n
    data[i + 1] = (data[i + 1] ?? 0) + n
    data[i + 2] = (data[i + 2] ?? 0) + n
  }
  ctx.putImageData(image, 0, 0)
}

/** Faint background dust too small to twinkle. */
function paintDust(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const count = Math.min(1400, (w * h) / 900)
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = `rgb(255 255 255 / ${between(0.05, 0.35)})`
    ctx.fillRect(between(0, w), between(0, h), 1, 1)
  }
}

/**
 * A ringed planet low in one corner. The ring is drawn in two halves, the far
 * half before the planet and the near half after, so it wraps round it.
 */
function paintPlanet(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  // Tucked into the corner on a narrow screen, clear of the cards.
  const narrow = w < 640
  const r = Math.min(w, h) * (narrow ? 0.2 : 0.13)
  const x = w * (narrow ? 0.98 : 0.86)
  const y = h * (narrow ? 0.97 : 0.8)
  const hue = between(0, 360)
  const tilt = between(-0.45, -0.15)
  const ring = (from: number, to: number): void => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(tilt)
    ctx.lineWidth = r * 0.12
    ctx.strokeStyle = `hsl(${hue + 40} 45% 72% / 45%)`
    ctx.beginPath()
    ctx.ellipse(0, 0, r * 2, r * 0.42, 0, from, to)
    ctx.stroke()
    ctx.lineWidth = r * 0.04
    ctx.strokeStyle = `hsl(${hue + 40} 45% 80% / 35%)`
    ctx.beginPath()
    ctx.ellipse(0, 0, r * 1.7, r * 0.34, 0, from, to)
    ctx.stroke()
    ctx.restore()
  }
  ring(Math.PI, Math.PI * 2)
  // Lit from the upper left, where the nebulae are brightest on average.
  const body = ctx.createRadialGradient(
    x - r * 0.4,
    y - r * 0.4,
    r * 0.1,
    x,
    y,
    r,
  )
  body.addColorStop(0, `hsl(${hue} 55% 62%)`)
  body.addColorStop(0.7, `hsl(${hue} 50% 24%)`)
  body.addColorStop(1, `hsl(${hue} 50% 8%)`)
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ring(0, Math.PI)
}

/** Builds a new sky for a viewport `w` by `h` CSS pixels at `dpr`. */
export function makeSky(w: number, h: number, dpr: number): Sky {
  const backdrop = document.createElement('canvas')
  backdrop.width = w * dpr
  backdrop.height = h * dpr
  const ctx = backdrop.getContext('2d')
  if (ctx) {
    ctx.scale(dpr, dpr)
    // Opaque, so the grain below lands on colour rather than on alpha.
    ctx.fillStyle = '#020208'
    ctx.fillRect(0, 0, w, h)
    paintNebulae(ctx, w, h)
    paintGrain(ctx)
    paintDust(ctx, w, h)
    paintPlanet(ctx, w, h)
  }
  const stars = Array.from({ length: Math.min(420, (w * h) / 4500) }, () => ({
    x: between(0, w),
    y: between(0, h),
    r: between(0.4, 1.6),
    phase: between(0, Math.PI * 2),
    speed: between(0.6, 2.4),
    depth: between(0.2, 1),
    tint: TINTS[Math.floor(between(0, TINTS.length))] ?? '#fff',
  }))
  return { width: w, height: h, backdrop, stars, meteors: [], satellite: null }
}

/** Now and then, starts a shooting star or a satellite. */
function spawn(sky: Sky, dt: number): void {
  if (Math.random() < dt * 0.35) {
    const angle = between(0.35, 0.8) * (Math.random() < 0.5 ? 1 : -1)
    const speed = between(700, 1200)
    sky.meteors.push({
      x: between(0.1, 0.9) * sky.width,
      y: between(-0.05, 0.4) * sky.height,
      vx: Math.sin(angle) * speed,
      vy: Math.cos(angle) * speed * 0.6,
      age: 0,
      life: between(0.5, 1),
    })
  }
  if (!sky.satellite && Math.random() < dt * 0.04) {
    const left = Math.random() < 0.5
    sky.satellite = {
      x: left ? -10 : sky.width + 10,
      y: between(0.05, 0.5) * sky.height,
      vx: between(18, 30) * (left ? 1 : -1),
      vy: between(-6, 6),
    }
  }
}

/** Streaks each shooting star with a fading tail, and retires the spent ones. */
function drawMeteors(
  ctx: CanvasRenderingContext2D,
  sky: Sky,
  dt: number,
): void {
  sky.meteors = sky.meteors.filter((m) => (m.age += dt) < m.life)
  for (const m of sky.meteors) {
    m.x += m.vx * dt
    m.y += m.vy * dt
    // Brightens, then burns out.
    const fade = Math.sin((m.age / m.life) * Math.PI)
    const tail = ctx.createLinearGradient(
      m.x,
      m.y,
      m.x - m.vx * 0.12,
      m.y - m.vy * 0.12,
    )
    tail.addColorStop(0, `rgb(255 245 225 / ${fade})`)
    tail.addColorStop(1, 'transparent')
    ctx.strokeStyle = tail
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(m.x, m.y)
    ctx.lineTo(m.x - m.vx * 0.12, m.y - m.vy * 0.12)
    ctx.stroke()
  }
}

/** Moves the satellite on, blinking its light, until it leaves the sky. */
function drawSatellite(
  ctx: CanvasRenderingContext2D,
  sky: Sky,
  t: number,
  dt: number,
): void {
  const s = sky.satellite
  if (!s) return
  s.x += s.vx * dt
  s.y += s.vy * dt
  if (s.x < -20 || s.x > sky.width + 20) sky.satellite = null
  ctx.fillStyle = 'rgb(220 230 255 / 70%)'
  ctx.fillRect(s.x, s.y, 1.5, 1.5)
  if (t % 1.4 < 0.12) {
    ctx.fillStyle = '#ff5a5a'
    ctx.beginPath()
    ctx.arc(s.x + 0.75, s.y + 0.75, 1.8, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * Draws one frame at time `t` seconds, `dt` after the last. `pointer` runs
 * from -1 to 1 on each axis and slides the stars for a little parallax.
 */
export function drawSky(
  ctx: CanvasRenderingContext2D,
  sky: Sky,
  t: number,
  dt: number,
  pointer: { x: number; y: number },
): void {
  ctx.drawImage(sky.backdrop, 0, 0, sky.width, sky.height)
  for (const star of sky.stars) {
    const glow = 0.55 + 0.45 * Math.sin(t * star.speed + star.phase)
    ctx.globalAlpha = glow
    ctx.fillStyle = star.tint
    ctx.beginPath()
    ctx.arc(
      star.x - pointer.x * star.depth * 14,
      star.y - pointer.y * star.depth * 14,
      star.r,
      0,
      Math.PI * 2,
    )
    ctx.fill()
  }
  ctx.globalAlpha = 1
  if (dt === 0) return
  spawn(sky, dt)
  drawMeteors(ctx, sky, dt)
  drawSatellite(ctx, sky, t, dt)
}
