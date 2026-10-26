import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { Game } from '../src/game/game'
import type { CityInteractable } from '../src/game/world'

function harness(): { game: Game; source: CityInteractable; latch: CityInteractable; audio: any; world: any; hooks: any } {
  const source: CityInteractable = { id: 'source', label: 'source', position: new THREE.Vector3(-3.7, 1.1, 5.9), group: new THREE.Group() }
  const latch: CityInteractable = { id: 'latch', label: 'latch', position: new THREE.Vector3(2.6, 1.3, -7), group: new THREE.Group() }
  const audio = {
    play: vi.fn(), playResonance: vi.fn(), performRest: vi.fn(), setAtmosphere: vi.fn(),
  }
  const world = {
    interactables: [source, latch], setPuzzle: vi.fn(), openPassage: vi.fn(), setFading: vi.fn(), fadingValue: 0,
  }
  const hooks = {
    story: vi.fn(), objective: vi.fn(), interaction: vi.fn(), borrowed: vi.fn(), puzzle: vi.fn(), ending: vi.fn(),
  }
  const game = Object.create(Game.prototype) as Game
  Object.assign(game, {
    mode: 'playing', borrowedSa: false, progress: 0, noise: 0, gateOpen: false,
    quietStarted: false, quietDone: false, quietTimer: 0, lastStory: -10,
    player: { position: new THREE.Vector3(0, 1.25, 0), facing: 0 }, audio, world, hooks,
  })
  return { game, source, latch, audio, world, hooks }
}
const interact = (game: Game, target: CityInteractable) => (game as any).interact(target)
const rest = (game: Game, target: CityInteractable) => (game as any).rest(target)

describe('Seven Notes opening mechanics', () => {
  it('borrows Sa from the workshop source without making it a permanent power', () => {
    const { game, source, hooks, audio } = harness()
    interact(game, source)
    expect(game.currentNote).toBe('Sa')
    expect(hooks.borrowed).toHaveBeenCalledWith('Sa')
    expect(hooks.objective).toHaveBeenCalledWith('Carry Sa to the ring-street tension latch.')
    expect(audio.playResonance).toHaveBeenCalledWith('Sa', 0)
  })

  it('turns quick repeated resonance into strain, then Rest safely recovers and opens the route', () => {
    const { game, latch, world, audio, hooks } = harness()
    Object.assign(game, { borrowedSa: true })
    interact(game, latch)
    interact(game, latch)
    expect(game.puzzleProgress).toBe(2)
    expect(game.puzzleNoise).toBeGreaterThan(0.58)
    interact(game, latch)
    expect(game.puzzleProgress).toBe(2)
    expect(world.openPassage).not.toHaveBeenCalled()

    rest(game, latch)
    expect(game.puzzleNoise).toBe(0)
    expect(audio.performRest).toHaveBeenCalledOnce()
    interact(game, latch)
    expect(game.puzzleProgress).toBe(3)
    expect(world.openPassage).toHaveBeenCalledOnce()
    expect(hooks.objective).toHaveBeenCalledWith('Cross the Ring Street and follow the four strings to the Quiet Quarter.')
  })

  it('stages the Evening Minute through sound loss and restores the objective for the final trace', () => {
    const { game, audio, hooks, world } = harness()
    Object.assign(game, { quietTimer: 0, lastStory: -10, quietDone: false })
    ;(game as any).advanceEveningMinute(7.3)
    expect(game.narrativeComplete).toBe(true)
    expect(world.setFading).toHaveBeenCalledWith(0.88)
    expect(audio.setAtmosphere).toHaveBeenCalled()
    expect(hooks.objective).toHaveBeenCalledWith('Inspect the broken resonance trace in the square.')
  })
})
