import * as THREE from 'three'
import type { Audio } from '../engine/audio'
import type { Input } from '../engine/input'
import { Physics, RAPIER } from '../engine/physics'
import type { Renderer } from '../engine/renderer'
import type { Quality } from '../engine/save'
import { FollowCamera } from './camera'
import { CONFIG } from './config'
import { Player, type PlayerEvent } from './player'
import { World, type CityInteractable } from './world'

export type Mode = 'attract' | 'playing' | 'paused' | 'ended'
export type GameHooks = {
  story(text: string): void
  objective(text: string): void
  interaction(text: string | null): void
  borrowed(note: string | null): void
  puzzle(progress: number, noise: number, open: boolean): void
  ending(): void
}

/** The opening slice: movement, one borrowed note, one noisy mechanism, Rest and the Fading. */
export class Game {
  mode: Mode = 'attract'
  reducedMotion = false
  readonly physics: Physics
  readonly world: World
  readonly player: Player
  readonly cam: FollowCamera
  private simTime = 0
  private time = 0
  private borrowedSa = false
  private progress = 0
  private noise = 0
  private gateOpen = false
  private quietStarted = false
  private quietDone = false
  private quietTimer = 0
  private lastStory = -10
  private district: 'strung' | 'ring' | 'quiet' | '' = ''
  private readonly down = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })

  constructor(
    private readonly renderer: Renderer,
    private readonly input: Input,
    private readonly audio: Audio,
    private readonly hooks: GameHooks,
  ) {
    this.physics = new Physics(CONFIG.player.gravity)
    this.world = new World(this.physics, renderer.shadowMapSize)
    this.player = new Player(this.physics, this.world.spawn, this.world.movers)
    this.cam = new FollowCamera(this.physics, this.player.collider)
    this.world.scene.add(this.player.root, this.player.shadowMesh)
    this.cam.reset(this.world.spawn, 0.18)
  }

  get camera(): THREE.PerspectiveCamera { return this.cam.camera }
  get currentNote(): string | null { return this.borrowedSa ? 'Sa' : null }
  get puzzleProgress(): number { return this.progress }
  get puzzleNoise(): number { return this.noise }
  get narrativeComplete(): boolean { return this.quietDone }

  start(): void {
    this.player.teleport(this.world.spawn)
    this.player.facing = 0
    this.cam.pitch = 0.3
    this.cam.reset(this.world.spawn, 0.18)
    this.borrowedSa = false
    this.progress = 0
    this.noise = 0
    this.gateOpen = false
    this.quietStarted = false
    this.quietDone = false
    this.quietTimer = 0
    this.district = ''
    this.world.resetPuzzle()
    this.world.setFading(0)
    this.updatePuzzlePresentation()
    this.mode = 'playing'
    this.input.endFrame()
    this.input.takeLook()
    this.hooks.borrowed(null)
    this.hooks.interaction(null)
    this.hooks.objective('Follow the hanging cords to the mender’s courtyard.')
    this.hooks.story('Sa is still at work. Today, Hollow turns sixteen.')
  }

  pause(): void { if (this.mode === 'playing') this.mode = 'paused' }
  resume(): void {
    if (this.mode !== 'paused') return
    this.mode = 'playing'; this.input.endFrame(); this.input.takeLook()
  }
  toTitle(): void { this.mode = 'attract'; this.hooks.interaction(null) }

  setQuality(quality: Quality): void {
    this.renderer.applyQuality(quality)
    const size = this.renderer.shadowMapSize
    const shadow = this.world.sun.shadow
    shadow.map?.dispose(); shadow.map = null; shadow.mapSize.set(size, size)
    this.world.scene.traverse(obj => {
      const material = (obj as THREE.Mesh).material
      for (const m of Array.isArray(material) ? material : material ? [material] : []) m.needsUpdate = true
    })
  }

  step(dt: number): void {
    this.simTime += dt
    const jumpPressed = this.input.consume('jump')
    const interactPressed = this.input.consume('interact')
    const restPressed = this.input.consume('rest')
    this.world.stepMovers(this.simTime)

    const inSequence = this.mode === 'playing' && this.quietStarted && !this.quietDone
    const events: PlayerEvent[] = []
    if (this.mode === 'playing' && !inSequence) {
      this.player.step(dt, {
        moveX: this.input.move.x,
        moveY: this.input.move.y,
        sprint: this.input.held('sprint'),
        jumpPressed,
        jumpHeld: this.input.held('jump'),
      }, this.cam.yaw, events)
    }
    this.physics.step(dt)
    if (this.mode !== 'playing') return

    this.noise = Math.max(0, this.noise - dt * 0.05)
    const playerPosition = this.player.position
    this.updateDistrict(playerPosition)
    for (const event of events) {
      if (event.type === 'jump') this.audio.play('jump')
      else if (event.type === 'land') this.audio.play('land')
    }

    if (inSequence) {
      this.advanceEveningMinute(dt)
      this.world.setFading(this.quietTimer < 1.4 ? 0 : THREE.MathUtils.smoothstep((this.quietTimer - 1.4) / 5.2, 0, 1) * 0.88)
      this.hooks.interaction(null)
      this.updatePuzzlePresentation()
      return
    }

    this.checkEveningMinute(playerPosition)
    if (this.quietStarted && !this.quietDone) return

    const nearby = this.nearestInteractable(playerPosition)
    this.hooks.interaction(nearby ? this.promptFor(nearby) : null)
    if (restPressed) this.rest(nearby)
    if (interactPressed && nearby) this.interact(nearby)
    this.updatePuzzlePresentation()
  }

  render(alpha: number, frameSeconds: number): void {
    this.time += frameSeconds
    this.physics.sync(alpha)
    const target = this.player.root.position
    if (this.mode === 'attract') {
      const t = this.time * 0.025 + 0.68
      this.camera.position.set(Math.sin(t) * 27, 29 + Math.sin(this.time * 0.12) * 0.8, 2 + Math.cos(t) * 27)
      this.camera.lookAt(5, 6, -8)
    } else {
      const look = this.mode === 'playing' ? this.input.takeLook() : { x: 0, y: 0 }
      this.cam.update(target, look, frameSeconds, false, this.reducedMotion)
    }
    this.player.animate(frameSeconds, this.time, false, this.groundBelow(target))
    this.world.update(frameSeconds, target, this.world.fadingValue)
    this.renderer.render(this.world.scene, this.camera)
  }

  private advanceEveningMinute(dt: number): void {
    this.quietTimer += dt
    if (this.quietTimer > 1.3 && this.lastStory < 0) {
      this.lastStory = 1.3
      this.hooks.story('The strings tremble, but their tones do not arrive.')
      this.audio.playResonance('Sa', 0.12)
      this.audio.setAtmosphere(0.38)
    }
    if (this.quietTimer > 3.2 && this.lastStory < 2) {
      this.lastStory = 2
      this.hooks.story('The central phrase returns with a space missing.')
      this.audio.playResonance('Re', 0.55)
    }
    if (this.quietTimer > 5.8 && this.lastStory < 3) {
      this.lastStory = 3
      this.hooks.story('The Evening Minute ends. The city does not begin again.')
      this.audio.setAtmosphere(0.78)
    }
    if (this.quietTimer >= 7.2) {
      this.quietDone = true
      this.world.setFading(0.88)
      this.hooks.objective('Inspect the broken resonance trace in the square.')
      this.hooks.story('Hollow is still here. The note is not.')
    }
  }

  private checkEveningMinute(p: THREE.Vector3): void {
    if (this.quietStarted || this.gateOpen === false) return
    if (p.z < -18.7 && Math.abs(p.x) < 8.5) {
      this.quietStarted = true
      this.quietTimer = 0
      this.lastStory = -10
      this.hooks.objective('The Evening Minute')
      this.hooks.story('Families take their places. A pause passes through the square.')
      this.audio.performRest(this.world.fadingValue)
    }
  }

  private updateDistrict(position: THREE.Vector3): void {
    const next = position.z > 0 ? 'strung' : position.z > -16 ? 'ring' : 'quiet'
    if (next === this.district) return
    this.district = next
    this.audio.setDistrict(next)
  }

  private nearestInteractable(p: THREE.Vector3): CityInteractable | null {
    let result: CityInteractable | null = null
    let best = 3.15 * 3.15
    for (const target of this.world.interactables) {
      const d = p.distanceToSquared(target.position)
      if (d < best) { result = target; best = d }
    }
    return result
  }

  private promptFor(target: CityInteractable): string {
    if (target.id === 'source') return this.borrowedSa ? 'E · Listen again' : 'E · Borrow the hanging note'
    if (target.id === 'latch') return !this.borrowedSa ? 'E · The latch has no note' : this.gateOpen ? 'The latch is open' : this.noise > 0.58 ? 'Q · Rest the strained string' : `E · Sound the latch (${this.progress}/3)`
    if (!this.quietDone) return 'E · The trace has not settled'
    return 'E · Inspect the broken trace'
  }

  private interact(target: CityInteractable): void {
    const p = this.player.position
    this.player.facing = Math.atan2(-(target.position.x - p.x), -(target.position.z - p.z))
    if (target.id === 'source') {
      if (!this.borrowedSa) {
        this.borrowedSa = true
        this.audio.playResonance('Sa', 0)
        this.hooks.borrowed('Sa')
        this.hooks.objective('Carry Sa to the ring-street tension latch.')
        this.hooks.story('A note lent by another hand. Hollow does not keep it.')
      } else {
        this.audio.playResonance('Sa', 0)
        this.hooks.story('The string gives the note back, then lets it end.')
      }
      return
    }
    if (target.id === 'latch') {
      if (!this.borrowedSa) {
        this.audio.play('ui')
        this.hooks.story('The old mechanism answers nothing. Find the mender’s note.')
        return
      }
      if (this.noise > 0.58) {
        this.audio.playResonance('Sa', 0.85)
        this.hooks.story('The string is holding too much. Wait for it to fade, or Rest (Q).')
        return
      }
      if (this.gateOpen) {
        this.audio.playResonance('Sa', this.noise)
        return
      }
      this.progress += 1
      this.noise = Math.min(1, this.noise + 0.36)
      this.audio.playResonance('Sa', this.noise)
      if (this.noise >= 0.7 && this.progress < 3) {
        this.hooks.story('Too much, too soon. Stop the sound; the strain is collecting.')
      } else if (this.progress >= 3) {
        this.gateOpen = true
        this.world.openPassage()
        this.hooks.objective('Cross the Ring Street and follow the four strings to the Quiet Quarter.')
        this.hooks.story('The latch yields when the note is allowed to finish.')
      } else {
        this.hooks.story(`The counterweight rises. The string keeps a trace (${this.progress}/3).`)
      }
      this.updatePuzzlePresentation()
      return
    }
    if (!this.quietDone) {
      this.hooks.story('The trace is unfinished. Wait for the square to settle.')
      return
    }
    this.audio.performRest(this.world.fadingValue)
    this.audio.playResonance('Sa', 0.04)
    this.hooks.story('A final vibration has no answer. Somewhere beyond it, a note waits without being played.')
    this.hooks.objective('The Seven Notes: Fading — the story continues.')
    this.mode = 'ended'
    this.hooks.ending()
  }

  private rest(nearby: CityInteractable | null): void {
    const wasNoisy = this.noise > 0.01
    this.noise = 0
    this.audio.performRest(this.world.fadingValue)
    if (wasNoisy && nearby?.id === 'latch') {
      this.hooks.story('Hollow does not answer. The strained string settles into its own silence.')
    } else if (wasNoisy) {
      this.hooks.story('The last vibration thins. Space returns between sounds.')
    } else {
      this.hooks.story('For a moment, Hollow lets the city finish by itself.')
    }
    this.updatePuzzlePresentation()
  }

  private updatePuzzlePresentation(): void {
    this.world.setPuzzle(this.progress, this.noise, this.gateOpen)
    this.hooks.puzzle(this.progress, this.noise, this.gateOpen)
  }

  private groundBelow(p: THREE.Vector3): number | null {
    this.down.origin = { x: p.x, y: p.y, z: p.z }
    const hit = this.physics.world.castRay(this.down, 30, true, undefined, undefined, this.player.collider)
    return hit ? p.y - hit.timeOfImpact : null
  }
}
