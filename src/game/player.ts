import * as THREE from 'three'
import { RAPIER, type Physics } from '../engine/physics'
import { CONFIG } from './config'
import { tuning } from './tuning'
import type { MovingPlatform } from './world'

export type PlayerIntent = { moveX: number; moveY: number; sprint: boolean; jumpPressed: boolean; jumpHeld: boolean }
export type PlayerEvent = { type: 'jump' } | { type: 'land'; impact: number }

const P = CONFIG.player
const UP = new THREE.Vector3(0, 1, 0)

/**
 * Third-person character on Rapier's KinematicCharacterController: the controller resolves
 * collisions, slopes, steps and ground snapping; this class owns the "game feel" (acceleration,
   * coyote time, jump buffering, variable jump height and moving-platform carry).
 */
export class Player {
  readonly root = new THREE.Group()
  readonly body: RAPIER.RigidBody
  readonly collider: RAPIER.Collider
  readonly velocity = new THREE.Vector3()
  grounded = false
  facing = 0
  private readonly controller: RAPIER.KinematicCharacterController
  private readonly model = new THREE.Group()
  private readonly eyes: THREE.Mesh
  private readonly shadow: THREE.Mesh
  private coyote = 0
  private jumpBuffer = 0
  private jumping = false
  private squash = 0
  private runCycle = 0
  private platform?: MovingPlatform
  /** Last position where the player stood on solid, static ground (respawn point after a fall). */
  readonly safe = new THREE.Vector3()
  private safeTimer = 0

  constructor(private readonly physics: Physics, spawn: THREE.Vector3, private readonly movers: MovingPlatform[]) {
    const world = physics.world
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y, spawn.z))
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(P.halfHeight, P.radius).setFriction(0), this.body)
    this.controller = world.createCharacterController(0.02)
    this.controller.enableAutostep(0.4, 0.25, false)
    this.controller.enableSnapToGround(0.35)
    this.controller.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(50))
    this.controller.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(35))
    this.controller.setApplyImpulsesToDynamicBodies(true)
    this.safe.copy(spawn)

    this.root.position.copy(spawn)
    this.eyes = this.buildModel()
    this.model.rotation.order = 'YXZ'
    this.root.add(this.model)
    physics.bind(this.body, this.root)

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(P.radius * 1.25, 24),
      new THREE.MeshBasicMaterial({ color: '#1d1a2a', transparent: true, opacity: 0.35, depthWrite: false }),
    )
    this.shadow.rotation.x = -Math.PI / 2
    this.shadow.renderOrder = 1
  }

  get shadowMesh(): THREE.Mesh {
    return this.shadow
  }

  get position(): THREE.Vector3 {
    const t = this.body.translation()
    return new THREE.Vector3(t.x, t.y, t.z)
  }

  /** One fixed step. `cameraYaw` makes stick/WASD movement camera-relative. */
  step(dt: number, intent: PlayerIntent, cameraYaw: number, events: PlayerEvent[]): void {
    const forward = new THREE.Vector3(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw))
    const right = new THREE.Vector3().crossVectors(forward, UP)
    const wish = new THREE.Vector3().addScaledVector(right, intent.moveX).addScaledVector(forward, intent.moveY)
    const wishLen = Math.min(1, wish.length())
    if (wishLen > 0.01) wish.normalize()

    this.coyote = this.grounded ? P.coyoteTime : Math.max(0, this.coyote - dt)
    this.jumpBuffer = intent.jumpPressed ? P.jumpBuffer : Math.max(0, this.jumpBuffer - dt)
    const jumpReady = this.jumpBuffer > 0 && this.coyote > 0

    const speed = (intent.sprint ? P.sprintSpeed : P.walkSpeed) * wishLen
    const control = this.grounded ? 1 : P.airControl
    const target = wish.clone().multiplyScalar(speed)
    const horizontal = new THREE.Vector3(this.velocity.x, 0, this.velocity.z)
    horizontal.lerp(target, 1 - Math.exp(-(P.acceleration / 6) * control * dt))
    this.velocity.x = horizontal.x
    this.velocity.z = horizontal.z

    if (jumpReady) {
      tuning.activate('jump')
      this.velocity.y = P.jumpSpeed
      this.jumping = true
      this.jumpBuffer = 0
      this.coyote = 0
      this.grounded = false
      this.platform = undefined
      this.squash = -0.35
      events.push({ type: 'jump' })
    }
    const rising = this.velocity.y > 0
    const gravity = rising && this.jumping && !intent.jumpHeld ? P.lowJumpGravity : P.gravity
    this.velocity.y = Math.max(P.maxFall, this.velocity.y + gravity * dt)

    if (wishLen > 0.1) {
      const targetYaw = Math.atan2(-wish.x, -wish.z)
      this.facing = dampAngle(this.facing, targetYaw, P.turnSpeed, dt)
    }

    const desired = this.velocity.clone().multiplyScalar(dt)
    if (this.platform) desired.add(this.platform.delta)
    this.controller.computeColliderMovement(this.collider, desired)
    const moved = this.controller.computedMovement()
    const wasGrounded = this.grounded
    this.grounded = this.controller.computedGrounded()

    // Bumped a ceiling: stop rising.
    if (this.velocity.y > 0 && moved.y < desired.y - 1e-3) this.velocity.y = 0
    if (this.grounded) {
      if (!wasGrounded && this.velocity.y < -6) {
        events.push({ type: 'land', impact: Math.min(1, -this.velocity.y / 30) })
        this.squash = Math.min(0.45, -this.velocity.y / 60)
      }
      if (this.velocity.y < 0) this.velocity.y = -1
      this.jumping = false
    }

    const cur = this.body.translation()
    const next = { x: cur.x + moved.x, y: cur.y + moved.y, z: cur.z + moved.z }
    this.body.setNextKinematicTranslation(next)
    this.platform = this.grounded ? this.findPlatform(next) : undefined

    if (this.grounded && !this.platform) {
      this.safeTimer += dt
      if (this.safeTimer > 0.4) this.safe.set(next.x, next.y + 0.2, next.z)
    } else {
      this.safeTimer = 0
    }
  }

  private findPlatform(pos: { x: number; y: number; z: number }): MovingPlatform | undefined {
    const feet = pos.y - P.halfHeight - P.radius
    return this.movers.find(m => {
      const c = m.body.translation()
      const top = c.y + m.half.y
      return Math.abs(feet - top) < 0.2 && Math.abs(pos.x - c.x) < m.half.x + P.radius * 0.6 && Math.abs(pos.z - c.z) < m.half.z + P.radius * 0.6
    })
  }

  /** Teleport (respawn). Clears velocity and interpolation so the camera does not streak. */
  teleport(to: THREE.Vector3): void {
    this.body.setTranslation(to, true)
    this.body.setNextKinematicTranslation(to)
    this.velocity.set(0, 0, 0)
    this.platform = undefined
    this.root.position.copy(to)
    this.physics.snap(this.body)
  }

  /** Knock the player away from a hazard. */
  knockback(from: THREE.Vector3): void {
    const away = this.position.sub(from).setY(0)
    if (away.lengthSq() < 1e-4) away.set(1, 0, 0)
    away.normalize().multiplyScalar(9)
    this.velocity.set(away.x, 7, away.z)
    this.grounded = false
    this.platform = undefined
  }

  /** Visual-only animation, once per rendered frame after `physics.sync()`. */
  animate(frameSeconds: number, time: number, invulnerable: boolean, ground: number | null): void {
    const speed = Math.hypot(this.velocity.x, this.velocity.z)
    this.model.rotation.y = this.facing
    this.squash = THREE.MathUtils.damp(this.squash, 0, 10, frameSeconds)
    const stretch = this.grounded ? 0 : THREE.MathUtils.clamp(this.velocity.y / 60, -0.12, 0.18)
    const s = 1 - this.squash + stretch
    this.model.scale.set(1 / Math.sqrt(Math.max(s, 0.5)), s, 1 / Math.sqrt(Math.max(s, 0.5)))
    if (this.grounded && speed > 0.5) this.runCycle += frameSeconds * speed * 1.6
    const bob = this.grounded ? Math.abs(Math.sin(this.runCycle)) * 0.08 * Math.min(1, speed / 6) : 0
    this.model.position.y = bob
    this.model.rotation.x = -Math.min(0.2, speed / 55)
    this.model.visible = !invulnerable || Math.floor(time * 16) % 2 === 0
    ;(this.eyes.material as THREE.MeshStandardMaterial).emissiveIntensity = 0

    // Blob shadow: always-on depth cue for platforming, even with real shadows disabled.
    if (ground === null) {
      this.shadow.visible = false
    } else {
      const feet = this.root.position.y - P.halfHeight - P.radius
      const height = Math.max(0, feet - ground)
      this.shadow.visible = height < 14
      this.shadow.position.set(this.root.position.x, ground + 0.03, this.root.position.z)
      const k = THREE.MathUtils.clamp(1 - height / 14, 0.25, 1)
      this.shadow.scale.setScalar(k)
      ;(this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.38 * k
    }
  }

  private buildModel(): THREE.Mesh {
    // Procedural stand-in: a human adolescent silhouette in repaired, layered street clothing.
    // It intentionally avoids the starter robot's visor, antenna, emissive eyes and bright trim.
    const skin = new THREE.MeshStandardMaterial({ color: '#a98267', roughness: 0.84 })
    const robe = new THREE.MeshStandardMaterial({ color: '#39352f', roughness: 0.94 })
    const under = new THREE.MeshStandardMaterial({ color: '#c1b49b', roughness: 0.93 })
    const hair = new THREE.MeshStandardMaterial({ color: '#201e1b', roughness: 0.92 })
    const bronze = new THREE.MeshStandardMaterial({ color: '#8e7650', roughness: 0.65, metalness: 0.22 })
    const dark = new THREE.MeshStandardMaterial({ color: '#261f19', roughness: 0.72 })
    const eyes = new THREE.MeshStandardMaterial({ color: '#2c211b', roughness: 0.75 })
    const add = (mesh: THREE.Mesh, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
      mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow = true; this.model.add(mesh); return mesh
    }

    const tunic = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.68, 5, 10), robe)
    add(tunic, 0, -0.22, 0, 1.08, 1.06, 0.78)
    const front = new THREE.Mesh(new THREE.ConeGeometry(0.37, 0.9, 5), under)
    front.rotation.y = Math.PI / 5
    add(front, 0, -0.48, -0.245, 0.72, 0.92, 0.32)
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.07, 7, 24), under)
    collar.rotation.x = Math.PI / 2
    add(collar, 0, 0.11, 0)
    const sash = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 6, 24), bronze)
    sash.rotation.x = Math.PI / 2; sash.rotation.z = -0.16
    add(sash, 0, -0.3, 0)

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.13, 0.22, 9), skin)
    add(neck, 0, 0.28, -0.01)
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.285, 20, 16), skin)
    add(face, 0, 0.57, -0.03, 0.88, 1.12, 0.88)
    const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.32, 7), skin)
    jaw.rotation.x = Math.PI
    add(jaw, 0, 0.43, -0.035, 0.92, 0.72, 0.9)
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), skin)
      add(ear, side * 0.25, 0.56, -0.005, 0.62, 1.1, 0.72)
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.037, 10, 8), eyes)
      add(eye, side * 0.095, 0.6, -0.265, 1.25, 0.72, 0.5)
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.025), hair)
      brow.rotation.z = side * -0.08
      add(brow, side * 0.095, 0.66, -0.265)
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), skin)
    add(nose, 0, 0.535, -0.3, 0.64, 0.72, 0.95)

    const haircap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.57), hair)
    add(haircap, 0, 0.68, -0.015, 1.06, 0.88, 1.02)
    for (const [x, y, z, scale] of [[-0.18, 0.73, -0.05, 0.72], [0.17, 0.76, -0.02, 0.68], [-0.03, 0.81, 0.06, 0.65]] as const) {
      const curl = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), hair)
      add(curl, x, y, z, scale, 0.65, scale)
    }
    const curlCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.08, 0.79, -0.2), new THREE.Vector3(0.2, 0.85, -0.16),
      new THREE.Vector3(0.28, 0.73, -0.12), new THREE.Vector3(0.2, 0.68, -0.18),
    ])
    const stray = new THREE.Mesh(new THREE.TubeGeometry(curlCurve, 12, 0.055, 6, false), hair)
    this.model.add(stray); stray.castShadow = true

    for (const side of [-1, 1]) {
      const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.42, 4, 8), robe)
      sleeve.rotation.z = side * -0.18
      add(sleeve, side * 0.39, -0.18, 0.005, 1, 1, 0.95)
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), skin)
      add(hand, side * 0.42, -0.47, -0.015, 0.8, 1, 0.8)
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.13, 0.38, 8), under)
      add(leg, side * 0.14, -0.77, 0)
      const sandal = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.32), dark)
      add(sandal, side * 0.14, -0.96, -0.055)
    }
    // One small worn brass token, not a glowing rune or magic resource.
    const token = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 5, 14), bronze)
    token.position.set(0.06, -0.05, -0.31); this.model.add(token)
    return this.model.children.find(c => (c as THREE.Mesh).isMesh && (c as THREE.Mesh).material === eyes) as THREE.Mesh
  }
}

function dampAngle(from: number, to: number, lambda: number, dt: number): number {
  let delta = (to - from) % (Math.PI * 2)
  if (delta > Math.PI) delta -= Math.PI * 2
  if (delta < -Math.PI) delta += Math.PI * 2
  return from + delta * (1 - Math.exp(-lambda * dt))
}
