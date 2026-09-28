/**
 * The buggy's engine and the rain, made up on the spot with Web Audio: no
 * sound files, so nothing is fetched (ADR 0011). The engine is two detuned
 * oscillators through a low-pass filter, rising in pitch and opening up with
 * speed; the rain is filtered noise. Off until asked for, since a page that
 * starts making noise by itself is rude.
 */
export interface Sound {
  /** Sets the engine to `speed` world units a second, and how loud everything is, `0`–`1`. */
  update(speed: number, volume: number): void
  close(): void
}

/** Two seconds of white noise, looped for the rain. */
function noise(ctx: AudioContext): AudioBufferSourceNode {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.loop = true
  return source
}

/** Starts the sound; call from a key press or a click, which browsers require before audio. */
export function startSound(): Sound {
  const ctx = new AudioContext()
  const master = ctx.createGain()
  master.gain.value = 0
  master.connect(ctx.destination)

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 6
  filter.connect(master)
  const engine = ctx.createGain()
  engine.gain.value = 0.18
  engine.connect(filter)
  const oscillators = (['sawtooth', 'square'] as const).map((type, k) => {
    const osc = ctx.createOscillator()
    osc.type = type
    osc.detune.value = k * 9
    osc.connect(engine)
    osc.start()
    return osc
  })

  const rain = noise(ctx)
  const hiss = ctx.createBiquadFilter()
  hiss.type = 'bandpass'
  hiss.frequency.value = 2400
  hiss.Q.value = 0.6
  const wet = ctx.createGain()
  wet.gain.value = 0.05
  rain.connect(hiss).connect(wet).connect(master)
  rain.start()

  return {
    update(speed, volume) {
      const at = ctx.currentTime
      const pace = Math.min(1, Math.abs(speed) / 46)
      // Glides rather than jumps, so a change of speed sounds like a revving engine.
      for (const osc of oscillators)
        osc.frequency.setTargetAtTime(38 + pace * 110, at, 0.08)
      filter.frequency.setTargetAtTime(260 + pace * 1600, at, 0.1)
      master.gain.setTargetAtTime(volume * 0.6, at, 0.2)
    },
    close() {
      void ctx.close()
    },
  }
}
