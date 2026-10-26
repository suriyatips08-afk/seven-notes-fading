import './styles/main.css'
import { Audio } from './engine/audio'
import { Input } from './engine/input'
import { GameLoop } from './engine/loop'
import { SAVE_KEY, SaveStore, type SaveData } from './engine/save'
import type { Game } from './game/game'
import { TouchControls } from './ui/touch'
import { Ui } from './ui/ui'

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!
  const firstRun = safeGet(SAVE_KEY) === null
  const save = new SaveStore()
  // This prototype ships one game-content language; saved/browser language preferences do not switch it.
  document.documentElement.lang = 'en'
  const input = new Input(canvas)
  const audio = new Audio()
  let game: Game | undefined
  let loop: GameLoop | undefined
  let lockLostAt = 0

  const applySettings = (data: SaveData) => {
    input.sensitivity = data.sensitivity
    input.invertY = data.invertY
    audio.setMasterVolume(data.masterVolume)
    audio.setVolumes(data.musicVolume, data.sfxVolume, data.muted)
    if (game) game.reducedMotion = data.reducedMotion
  }

  const startRun = () => {
    if (!game) return
    audio.unlock()
    audio.startMusic()
    audio.setAtmosphere(0)
    game.start()
    ui.show('hud')
    loop?.resetAccumulator()
    input.lockPointer()
  }
  const pause = () => {
    if (game?.mode !== 'playing') return
    game.pause()
    ui.show('pause')
    input.unlockPointer()
  }
  const resume = () => {
    if (game?.mode !== 'paused') return
    game.resume()
    ui.show('hud')
    loop?.resetAccumulator()
    input.lockPointer()
  }

  const ui = new Ui(save, audio, input, {
    play: startRun,
    restart: startRun,
    resume,
    quit: () => {
      game?.toTitle()
      ui.show('title')
      input.unlockPointer()
    },
    settings: patch => {
      const qualityChanged = patch.quality !== undefined && patch.quality !== save.data.quality
      save.update(patch)
      applySettings(save.data)
      if (qualityChanged) game?.setQuality(save.data.quality)
    },
  })
  ui.show('boot')
  applySettings(save.data)

  const track = <T>(promise: Promise<T>, index: { value: number }) => promise.then(result => {
    index.value += 1
    ui.setBootProgress(0.12 + (index.value / 4) * 0.88)
    return result
  })
  const loaded = { value: 0 }
  const [{ Game }, { Renderer, suggestQuality }, physics] = await Promise.all([
    track(import('./game/game'), loaded),
    track(import('./engine/renderer'), loaded),
    track(import('./engine/physics'), loaded),
    track(document.fonts.ready.then(() => undefined), loaded),
  ])
  await physics.initPhysics()
  if (firstRun) {
    save.update({ quality: suggestQuality() })
    ui.refreshSettings()
  }
  const renderer = new Renderer(canvas, save.data.quality)
  game = new Game(renderer, input, audio, {
    story: text => ui.showStory(text),
    objective: text => ui.setObjective(text),
    interaction: text => ui.setInteraction(text),
    borrowed: note => ui.setBorrowed(note),
    puzzle: (progress, noise, open) => ui.setPuzzle(progress, noise, open),
    ending: () => {
      input.unlockPointer()
      ui.showEnding()
    },
  })
  game.reducedMotion = save.data.reducedMotion
  if (import.meta.env.DEV) {
    const [{ registerGameTuning }, { tuning }] = await Promise.all([
      import('../scripts/manus-tuning/adapter.js'), import('./game/tuning'),
    ])
    await registerGameTuning(tuning)
  }
  const currentGame = game
  loop = new GameLoop({
    beforeFrame: frameSeconds => input.update(frameSeconds),
    step: dt => currentGame.step(dt),
    render: (alpha, frameSeconds) => {
      if (input.consume('pause') && performance.now() - lockLostAt > 300) {
        if (currentGame.mode === 'playing') pause()
        else if (currentGame.mode === 'paused' && ui.screen === 'pause') resume()
      }
      ui.frame(frameSeconds)
      loop!.paused = currentGame.mode === 'paused'
      currentGame.render(alpha, frameSeconds)
    },
  })
  loop.start()

  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && currentGame.mode === 'playing' && input.method === 'keyboard') {
      lockLostAt = performance.now()
      pause()
    }
  })
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause() })
  window.addEventListener('game:pause', pause)
  canvas.addEventListener('click', () => { if (currentGame.mode === 'playing') input.lockPointer() })
  new TouchControls(document.getElementById('ui')!, input, () => currentGame.mode === 'playing')

  window.setTimeout(() => ui.show('title'), 250)
  ;(window as unknown as { __game: unknown }).__game = { game: currentGame, ui, input, save }
}

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

boot().catch(error => {
  console.error(error)
  const el = document.getElementById('ui')
  if (el) {
    el.innerHTML = `<div class="fatal"><div><p>Failed to start: ${String((error as Error)?.message ?? error).replace(/[<>&]/g, '')}</p><button class="retry-button">Retry</button></div></div>`
    el.querySelector('button.retry-button')?.addEventListener('click', () => location.reload())
  }
})
