import type { Audio } from '../engine/audio'
import type { Input } from '../engine/input'
import type { Quality, SaveData, SaveStore } from '../engine/save'

export type Screen = 'boot' | 'title' | 'hud' | 'pause' | 'settings' | 'ending'
export type UiActions = {
  play(): void
  resume(): void
  restart(): void
  quit(): void
  settings(patch: Partial<SaveData>): void
}

/** Small HTML layer for the narrative prototype. All gameplay text is pinned to English. */
export class Ui {
  screen: Screen = 'boot'
  private readonly root: HTMLElement
  private readonly stack: Screen[] = []
  private navRepeat = 0
  private lastMethod = ''
  private messageTimer = 0

  constructor(
    private readonly save: SaveStore,
    private readonly audio: Audio,
    private readonly input: Input,
    private readonly actions: UiActions,
  ) {
    this.root = document.getElementById('ui')!
    this.root.innerHTML = this.template()
    this.root.addEventListener('click', e => this.onClick(e))
    this.root.addEventListener('input', e => this.onInput(e))
    window.addEventListener('keydown', e => this.onKey(e))
    this.refreshSettings()
  }

  show(screen: Screen): void { this.stack.length = 0; this.setScreen(screen) }
  push(screen: Screen): void { this.stack.push(this.screen); this.setScreen(screen) }

  back(): void {
    const previous = this.stack.pop()
    if (previous) this.setScreen(previous)
    else if (this.screen === 'pause') this.actions.resume()
  }

  setBootProgress(progress: number): void {
    const bar = this.root.querySelector<HTMLElement>('.boot-bar i')
    if (bar) bar.style.transform = `scaleX(${Math.max(0.04, Math.min(1, progress))})`
  }

  setObjective(text: string): void { this.root.querySelector<HTMLElement>('[data-slot="objective"]')!.textContent = text }
  setInteraction(text: string | null): void {
    const prompt = this.root.querySelector<HTMLElement>('.interaction-prompt')!
    prompt.textContent = text ?? ''
    prompt.classList.toggle('is-visible', !!text)
  }
  setBorrowed(note: string | null): void {
    this.root.querySelector<HTMLElement>('[data-slot="note"]')!.textContent = note ?? 'None'
    this.root.querySelector<HTMLElement>('.note-state')!.classList.toggle('has-note', !!note)
  }
  setPuzzle(progress: number, noise: number, open: boolean): void {
    this.root.querySelector<HTMLElement>('.progress-fill')!.style.width = `${Math.max(0, Math.min(100, (progress / 3) * 100))}%`
    this.root.querySelector<HTMLElement>('.noise-fill')!.style.width = `${Math.max(0, Math.min(100, noise * 100))}%`
    const meter = this.root.querySelector<HTMLElement>('.resonance-state')!
    meter.classList.toggle('is-noisy', noise > 0.58)
    meter.classList.toggle('is-open', open)
    meter.querySelector<HTMLElement>('.resonance-caption')!.textContent = open ? 'The latch is open' : noise > 0.58 ? 'Strain is collecting · Q to Rest' : `${progress} of 3 resonances`
  }
  showStory(text: string): void {
    const el = this.root.querySelector<HTMLElement>('.story-line')!
    el.textContent = text
    el.classList.remove('show')
    void el.offsetWidth
    el.classList.add('show')
    window.clearTimeout(this.messageTimer)
    this.messageTimer = window.setTimeout(() => el.classList.remove('show'), 5200)
  }

  showEnding(): void { this.setScreen('ending') }

  refreshSettings(): void {
    const data = this.save.data
    for (const input of this.root.querySelectorAll<HTMLInputElement>('input[type="range"]')) {
      input.value = String(data[input.name as 'masterVolume' | 'musicVolume' | 'sfxVolume' | 'sensitivity'])
      this.updateRange(input)
    }
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('.toggle')) {
      const key = button.dataset.setting as 'muted' | 'invertY' | 'reducedMotion'
      button.setAttribute('aria-pressed', String(data[key]))
      button.querySelector('span')!.textContent = data[key] ? 'On' : 'Off'
    }
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('.seg button')) {
      const key = button.parentElement!.dataset.setting
      button.setAttribute('aria-pressed', String(key === 'quality' && button.dataset.value === data.quality))
    }
  }

  frame(frameSeconds: number): void {
    if (this.input.method !== this.lastMethod) {
      this.lastMethod = this.input.method
      this.renderPrompts()
    }
    if (this.screen === 'hud' || this.screen === 'boot') return
    if (this.input.method !== 'gamepad') {
      this.input.consume('confirm')
      this.input.consume('back')
      return
    }
    const y = this.input.move.y, x = this.input.move.x
    this.navRepeat = Math.max(0, this.navRepeat - frameSeconds)
    const active = document.activeElement as HTMLElement | null
    if (Math.abs(y) > 0.6 && this.navRepeat <= 0) {
      this.moveFocus(y < 0 ? 1 : -1); this.navRepeat = 0.22
    } else if (Math.abs(x) > 0.6 && this.navRepeat <= 0 && active?.matches('input[type="range"]')) {
      const range = active as HTMLInputElement
      range.value = String(Number(range.value) + Math.sign(x) * Number(range.step || 0.1))
      range.dispatchEvent(new Event('input', { bubbles: true })); this.navRepeat = 0.12
    } else if (Math.abs(y) < 0.3 && Math.abs(x) < 0.3) this.navRepeat = 0
    if (this.input.consume('confirm')) (document.activeElement as HTMLElement | null)?.click()
    if (this.input.consume('back') && this.screen !== 'title') this.back()
  }

  private setScreen(screen: Screen): void {
    this.screen = screen
    for (const section of this.root.querySelectorAll<HTMLElement>('[data-screen]')) {
      const active = section.dataset.screen === screen
      section.classList.toggle('is-active', active)
      section.setAttribute('aria-hidden', String(!active))
    }
    this.root.dataset.activeScreen = screen
    requestAnimationFrame(() => {
      const first = this.navItems()[0]
      if (first && this.input.method !== 'touch') first.focus({ preventScroll: true })
      else (document.activeElement as HTMLElement | null)?.blur?.()
    })
  }

  private onClick(event: MouseEvent): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action], .toggle, .seg button')
    if (!target) return
    this.audio.unlock()
    if (target.matches('.toggle')) {
      const key = target.dataset.setting as 'muted' | 'invertY' | 'reducedMotion'
      this.actions.settings({ [key]: !this.save.data[key] })
      this.refreshSettings(); this.audio.play('ui'); return
    }
    if (target.matches('.seg button')) {
      const setting = target.parentElement!.dataset.setting
      if (setting === 'quality') this.actions.settings({ quality: target.dataset.value as Quality })
      this.refreshSettings(); this.audio.play('ui'); return
    }
    switch (target.dataset.action) {
      case 'play': this.actions.play(); break
      case 'resume': this.actions.resume(); break
      case 'restart': this.actions.restart(); break
      case 'pause': window.dispatchEvent(new CustomEvent('game:pause')); break
      case 'quit':
        if (this.screen === 'title') this.showStory('You may close this browser tab to leave Sa.')
        else this.actions.quit()
        break
      case 'settings': this.push('settings'); break
      case 'back': this.back(); break
    }
  }

  private onInput(event: Event): void {
    const el = event.target as HTMLInputElement
    if (el.type !== 'range') return
    this.updateRange(el)
    this.actions.settings({ [el.name]: Number(el.value) } as Partial<SaveData>)
  }

  private updateRange(input: HTMLInputElement): void {
    input.style.setProperty('--fill', `${((Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100}%`)
  }

  private onKey(event: KeyboardEvent): void {
    if (this.screen === 'hud' || this.screen === 'boot') return
    const typing = (event.target as HTMLElement).matches?.('input')
    if ((event.code === 'Escape' || (event.code === 'Backspace' && !typing)) && this.screen !== 'title') {
      if (this.screen !== 'pause') {
        event.preventDefault(); this.input.consume('pause'); this.back()
      }
      return
    }
    if (event.code === 'ArrowDown' || event.code === 'ArrowUp') {
      event.preventDefault(); this.moveFocus(event.code === 'ArrowDown' ? 1 : -1)
    }
  }

  private navItems(): HTMLElement[] {
    const screen = this.root.querySelector(`[data-screen="${this.screen}"]`)
    return [...screen!.querySelectorAll<HTMLElement>('[data-nav]')].filter(el => el.offsetParent !== null)
  }

  private moveFocus(direction: 1 | -1): void {
    const items = this.navItems()
    if (!items.length) return
    const groups: HTMLElement[][] = []
    for (const item of items) {
      const segment = item.parentElement?.matches('.seg') ? item.parentElement : null
      const last = groups[groups.length - 1]
      if (segment && last && last[0].parentElement === segment) last.push(item)
      else groups.push([item])
    }
    const current = groups.findIndex(group => group.includes(document.activeElement as HTMLElement))
    const next = groups[(current + direction + groups.length) % groups.length]
    ;(next.find(el => el.getAttribute('aria-pressed') === 'true') ?? next[0]).focus()
  }

  private renderPrompts(): void {
    const prompt = this.root.querySelector<HTMLElement>('.menu-controls')
    if (prompt) prompt.textContent = this.input.method === 'gamepad' ? 'Left stick · Walk   Right stick · Look   A · Jump   LB · Run   X · Interact   B · Rest   Start · Pause' : 'WASD · Move   Mouse · Look   Space · Jump   Shift · Run   E · Interact   Q · Rest'
  }

  private template(): string {
    const range = (name: string, label: string, min: number, max: number, step: number) =>
      `<label class="setting-row"><span>${label}</span><input data-nav type="range" name="${name}" min="${min}" max="${max}" step="${step}"></label>`
    const toggle = (setting: string, label: string) =>
      `<div class="setting-row"><span>${label}</span><button data-nav class="toggle" data-setting="${setting}" aria-pressed="false"><i></i><span>Off</span></button></div>`
    return /* html */ `
<section class="screen boot-screen is-active" data-screen="boot"><img class="boot-favicon" src="/manus-storage/game/sha256/c451475e1d9aac2ba50f09cbdaa79069ca157e72be4e827969d9b143f557d76d.png" alt=""><div class="boot-wordmark">SEVEN NOTES</div><div class="boot-bar"><i></i></div><small>THE CITY IS LISTENING</small></section>
<section class="screen title-screen" data-screen="title">
  <div class="title-wash"></div><div class="title-copy">
    <div class="eyebrow">A STORY OF SA</div><div class="wordmark"><span class="seven-strokes" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><h1>SEVEN NOTES<br><em>FADING</em></h1></div>
    <p class="tagline">The world forgot how to let music end.</p>
    <nav class="menu"><button data-nav class="btn btn-primary" data-action="play">Start Game</button><button data-nav class="btn" data-action="settings">Settings</button><button data-nav class="btn" data-action="quit">Quit</button></nav>
  </div>
  <div class="title-foot"><span>SA · DUSK</span><span class="menu-controls">WASD · Move   Mouse · Look   Space · Jump   Shift · Run   E · Interact   Q · Rest</span></div>
</section>
<section class="screen play-screen" data-screen="hud">
  <div class="hud-top"><div class="objective-panel"><span class="eyebrow">OBJECTIVE</span><p data-slot="objective">Follow the hanging cords to the mender’s courtyard.</p></div><div class="note-state"><span>BORROWED</span><b data-slot="note">None</b><button class="pause-button" data-action="pause" aria-label="Pause">Ⅱ</button></div></div>
  <div class="resonance-state"><div class="meter-label"><span>RING-STREET LATCH</span><span class="resonance-caption">0 of 3 resonances</span></div><div class="meter-row"><span>Lift</span><div class="meter-track"><i class="progress-fill"></i></div></div><div class="meter-row noise-row"><span>Strain</span><div class="meter-track"><i class="noise-fill"></i></div></div></div>
  <div class="interaction-prompt"></div><div class="story-line" aria-live="polite"></div>
  <div class="touch"><div class="touch-stick"><i></i></div><button class="touch-btn touch-rest" data-touch="rest">REST</button><button class="touch-btn touch-interact" data-touch="interact">LISTEN</button><button class="touch-btn touch-jump" data-touch="jump">JUMP</button></div>
</section>
<section class="screen modal-screen" data-screen="pause"><div class="modal-card"><div class="eyebrow">SA · DUSK</div><h2>Paused</h2><nav class="menu"><button data-nav class="btn btn-primary" data-action="resume">Return to the city</button><button data-nav class="btn" data-action="restart">Begin again</button><button data-nav class="btn" data-action="settings">Settings</button><button data-nav class="btn" data-action="quit">Return to title</button></nav></div></section>
<section class="screen modal-screen" data-screen="settings"><div class="modal-card settings-card"><div class="eyebrow">A MOMENT TO LISTEN</div><h2>Settings</h2><div class="settings-grid">
<fieldset><legend>Audio</legend>${range('masterVolume', 'Master volume', 0, 1, 0.05)}${range('musicVolume', 'Ambience', 0, 1, 0.05)}${range('sfxVolume', 'Interactions', 0, 1, 0.05)}${toggle('muted', 'Mute all audio')}</fieldset>
<fieldset><legend>Controls & display</legend>${range('sensitivity', 'Look sensitivity', 0.2, 3, 0.1)}${toggle('invertY', 'Invert look')}${toggle('reducedMotion', 'Reduce motion')}<div class="setting-row"><span>Rendering</span><div class="seg" data-setting="quality"><button data-nav data-value="low">Low</button><button data-nav data-value="medium">Medium</button><button data-nav data-value="high">High</button></div></div></fieldset>
</div><nav class="menu menu-row"><button data-nav class="btn" data-action="back">Back</button></nav></div></section>
<section class="screen modal-screen ending-screen" data-screen="ending"><div class="modal-card ending-card"><div class="eyebrow">THE EVENING MINUTE</div><h2>The note is not.</h2><p>A final vibration has no answer. Somewhere beyond it, a note waits without being played.</p><p class="ending-mark">The Seven Notes: Fading</p><nav class="menu menu-row"><button data-nav class="btn btn-primary" data-action="restart">Begin again</button><button data-nav class="btn" data-action="quit">Return to title</button></nav></div></section>`
  }
}
