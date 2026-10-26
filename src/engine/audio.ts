/**
 * Web Audio mixer with music and SFX buses. Browsers only allow audio after a user gesture, so
 * call `unlock()` from the first click/key press (the title screen does this).
 *
 * The starter ships no audio files: SFX are synthesized and the music is a generative ambient
 * pad. To use recorded assets, `load(url)` an AudioBuffer and `playBuffer()` it on either bus.
 */
export type Sfx = 'pickup' | 'jump' | 'land' | 'hurt' | 'ui' | 'win' | 'lose'

export class Audio {
  readonly ctx: AudioContext
  private master: GainNode
  private music: GainNode
  private sfx: GainNode
  private atmosphere: GainNode
  private masterVolume = 1
  private musicTimer = 0
  private districtTimer = 0
  private district = ''
  private musicOn = false
  private buffers = new Map<string, AudioBuffer>()

  constructor() {
    this.ctx = new AudioContext()
    this.master = this.ctx.createGain()
    this.music = this.ctx.createGain()
    this.sfx = this.ctx.createGain()
    this.atmosphere = this.ctx.createGain()
    this.music.connect(this.atmosphere)
    this.atmosphere.connect(this.master)
    this.sfx.connect(this.master)
    this.master.connect(this.ctx.destination)
  }

  unlock(): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  /** Volumes in 0..1. */
  setVolumes(music: number, sfx: number, muted = false): void {
    const t = this.ctx.currentTime
    this.music.gain.setTargetAtTime(muted ? 0 : music * 0.55, t, 0.05)
    this.sfx.gain.setTargetAtTime(muted ? 0 : sfx * 0.8, t, 0.05)
    this.master.gain.setTargetAtTime(this.masterVolume, t, 0.05)
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = Math.min(1, Math.max(0, volume))
    this.master.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.05)
  }

  /** Gradually subtract ambience as the Evening Minute/Fading advances. */
  setAtmosphere(loss: number): void {
    const t = this.ctx.currentTime
    this.atmosphere.gain.setTargetAtTime(1 - Math.min(1, Math.max(0, loss)) * 0.82, t, 0.8)
  }

  /** A short, quiet synth placeholder for the borrowed notes (not a finished recorded score). */
  playResonance(note: 'Sa' | 'Re', noise = 0): void {
    if (this.ctx.state !== 'running') return
    const base = note === 'Sa' ? 220 : 246.94
    const t = this.ctx.currentTime
    const rough = Math.min(1, Math.max(0, noise))
    for (const [multiple, level, type] of [[1, 0.095, 'triangle'], [2, 0.034, 'sine'], [3, 0.018, rough > 0.55 ? 'sawtooth' : 'sine']] as const) {
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.type = type
      osc.frequency.setValueAtTime(base * multiple, t)
      osc.detune.setValueAtTime((Math.random() - 0.5) * 9 * rough, t)
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(level, t + 0.035)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + (0.7 + rough * 0.38))
      osc.connect(gain).connect(this.sfx)
      osc.start(t)
      osc.stop(t + 1.2)
    }
  }

  /** Rest thins the local sound bed, then gives the remaining ambience room to return. */
  performRest(fading = 0): void {
    if (this.ctx.state !== 'running') return
    const t = this.ctx.currentTime
    const returnTo = 1 - Math.min(1, Math.max(0, fading)) * 0.82
    this.atmosphere.gain.cancelScheduledValues(t)
    this.atmosphere.gain.setValueAtTime(this.atmosphere.gain.value, t)
    this.atmosphere.gain.setTargetAtTime(0.08, t, 0.18)
    this.atmosphere.gain.setTargetAtTime(returnTo, t + 1.15, 0.6)
  }

  /** The district bed is intentionally sparse: occasional borrowed-scale tones, never a full score. */
  setDistrict(district: 'strung' | 'ring' | 'quiet'): void {
    if (this.district === district) return
    this.district = district
    window.clearTimeout(this.districtTimer)
    if (district === 'quiet') return
    const play = () => {
      if (!this.musicOn || this.district !== district) return
      this.playResonance(district === 'strung' ? 'Sa' : 'Re', 0.08)
      this.districtTimer = window.setTimeout(play, district === 'strung' ? 6500 : 9000)
    }
    play()
  }

  async load(url: string): Promise<AudioBuffer> {
    const cached = this.buffers.get(url)
    if (cached) return cached
    const data = await (await fetch(url)).arrayBuffer()
    const buffer = await this.ctx.decodeAudioData(data)
    this.buffers.set(url, buffer)
    return buffer
  }

  playBuffer(buffer: AudioBuffer, bus: 'music' | 'sfx' = 'sfx', loop = false): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.loop = loop
    src.connect(bus === 'music' ? this.music : this.sfx)
    src.start()
    return src
  }

  play(name: Sfx): void {
    if (this.ctx.state !== 'running') return
    const t = this.ctx.currentTime
    const tone = (freq: number, end: number, dur: number, type: OscillatorType, vol: number, delay = 0) => {
      const o = this.ctx.createOscillator()
      const g = this.ctx.createGain()
      o.type = type
      o.frequency.setValueAtTime(freq, t + delay)
      o.frequency.exponentialRampToValueAtTime(Math.max(end, 20), t + delay + dur)
      g.gain.setValueAtTime(0.0001, t + delay)
      g.gain.exponentialRampToValueAtTime(vol, t + delay + 0.012)
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur)
      o.connect(g).connect(this.sfx)
      o.start(t + delay)
      o.stop(t + delay + dur + 0.05)
    }
    switch (name) {
      case 'pickup': tone(880, 1320, 0.12, 'triangle', 0.35); tone(1320, 1760, 0.16, 'sine', 0.25, 0.06); break
      case 'jump': tone(300, 620, 0.14, 'square', 0.12); break
      case 'land': tone(160, 70, 0.1, 'sine', 0.25); break
      case 'hurt': tone(220, 90, 0.28, 'sawtooth', 0.22); break
      case 'ui': tone(660, 700, 0.06, 'triangle', 0.18); break
      case 'win': [523, 659, 784, 1047].forEach((f, i) => tone(f, f * 1.01, 0.3, 'triangle', 0.25, i * 0.11)); break
      case 'lose': [392, 330, 262].forEach((f, i) => tone(f, f * 0.98, 0.38, 'sine', 0.25, i * 0.16)); break
    }
  }

  /** Quiet procedural placeholder: two related low strings, not a finished soundtrack. */
  startMusic(): void {
    if (this.musicOn) return
    this.musicOn = true
    const intervals = [[110, 164.81], [110, 220], [110, 146.83], [110, 164.81]]
    let bar = 0
    const schedule = () => {
      if (!this.musicOn) return
      const t = this.ctx.currentTime + 0.05
      const chord = intervals[bar % intervals.length]
      for (const f of chord) {
        for (const detune of [-6, 6]) {
          const o = this.ctx.createOscillator()
          const g = this.ctx.createGain()
          o.type = 'sine'
          o.frequency.value = f / 2
          o.detune.value = detune
          g.gain.setValueAtTime(0.0001, t)
          g.gain.linearRampToValueAtTime(0.022, t + 1.2)
          g.gain.linearRampToValueAtTime(0.0001, t + 4.2)
          o.connect(g).connect(this.music)
          o.start(t)
          o.stop(t + 4.4)
        }
      }
      bar += 1
      this.musicTimer = window.setTimeout(schedule, 5000)
    }
    schedule()
  }

  stopMusic(): void {
    this.musicOn = false
    clearTimeout(this.musicTimer)
    clearTimeout(this.districtTimer)
  }
}
