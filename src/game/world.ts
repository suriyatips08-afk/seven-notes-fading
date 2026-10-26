import * as THREE from 'three'
import type { Physics } from '../engine/physics'
import { RAPIER } from '../engine/physics'

// Retained as a pure geometry-planning utility for the starter's existing unit tests.
export type Island = { x: number; z: number; top: number; r: number; cores: number; decor?: boolean }
export const ISLANDS: Island[] = [
  { x: 0, z: 0, top: 0, r: 7, cores: 2 }, { x: 15, z: 3, top: 1.5, r: 4, cores: 2 },
  { x: 24, z: -8, top: 3.2, r: 3.5, cores: 2 }, { x: 14, z: -19, top: 4.8, r: 4.5, cores: 2 },
  { x: 0, z: -27, top: 6.5, r: 5, cores: 2 }, { x: -15, z: -16, top: 4.5, r: 4, cores: 2 },
  { x: -23, z: 1, top: 2.8, r: 3.5, cores: 2 }, { x: -11, z: 17, top: 1.2, r: 4.5, cores: 2 },
  { x: 7, z: 17, top: 2.5, r: 3.5, cores: 2 }, { x: 0, z: -12, top: 10.5, r: 3, cores: 3 },
]
const STONE = 1.8
const MAX_GAP = 2.3
const MAX_RISE = 1.05
export function planStones(a: Island, b: Island): { x: number; z: number; top: number }[] {
  const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz)
  const gap = d - a.r - b.r, dy = b.top - a.top
  let n = 0
  while ((gap - n * STONE) / (n + 1) > MAX_GAP || Math.abs(dy) / (n + 1) > MAX_RISE) n += 1
  const g = (gap - n * STONE) / (n + 1)
  const out: { x: number; z: number; top: number }[] = []
  for (let i = 1; i <= n; i += 1) {
    const along = a.r + g * i + STONE * (i - 0.5)
    out.push({ x: a.x + (dx / d) * along, z: a.z + (dz / d) * along, top: a.top + (dy * i) / (n + 1) })
  }
  return out
}
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

export type MovingPlatform = { mesh: THREE.Mesh; body: RAPIER.RigidBody; from: THREE.Vector3; to: THREE.Vector3; period: number; phase: number; delta: THREE.Vector3; half: THREE.Vector3 }
export type DroneRoute = { center: THREE.Vector3; radius: number; phase: number; dir: number }
export type CityInteractable = { id: 'source' | 'latch' | 'trace'; label: string; position: THREE.Vector3; group: THREE.Group }

const C = {
  stone: '#62594e', darkStone: '#403c36', plaster: '#b6a58a', pale: '#d8cbb2', timber: '#3e3026',
  bronze: '#8c7047', string: '#c3a36a', cloth: '#877264', shadow: '#1b1916', warm: '#d2b583',
}
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const standard = (color: string, roughness = 0.86, metalness = 0.04) => new THREE.MeshStandardMaterial({ color, roughness, metalness })

function box(parent: THREE.Object3D, size: THREE.Vector3, position: THREE.Vector3, mat: THREE.Material, cast = true): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mat)
  mesh.position.copy(position); mesh.castShadow = cast; mesh.receiveShadow = true; parent.add(mesh); return mesh
}
function cylinderBetween(parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, radius: number, mat: THREE.Material, sides = 8): THREE.Mesh {
  const d = new THREE.Vector3().subVectors(b, a)
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.9, radius, d.length(), sides), mat)
  mesh.position.copy(a).add(b).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())
  mesh.castShadow = true; parent.add(mesh); return mesh
}

/** A deliberately compact handmade city assembled from reusable primitive forms. */
export class World {
  readonly scene = new THREE.Scene()
  readonly sun: THREE.DirectionalLight
  readonly spawn = v(0, 1.25, 16)
  readonly movers: MovingPlatform[] = []
  readonly interactables: CityInteractable[] = []
  private readonly physics: Physics
  private readonly sway: THREE.Object3D[] = []
  private readonly fadeMaterials: Array<{ material: THREE.MeshStandardMaterial; color: THREE.Color; emissive: THREE.Color }> = []
  private gateCollider?: RAPIER.Collider
  private gate?: THREE.Group
  private latchBar?: THREE.Mesh
  private sourceTone?: THREE.Mesh
  private traceTone?: THREE.Mesh
  private baseBackground = new THREE.Color('#887e70')
  private fading = 0
  private time = 0

  get fadingValue(): number { return this.fading }

  constructor(physics: Physics, shadowMapSize: number) {
    this.physics = physics
    this.scene.background = this.baseBackground.clone()
    this.scene.fog = new THREE.Fog(this.baseBackground, 46, 112)
    this.scene.add(new THREE.HemisphereLight('#ded2bc', '#51483d', 1.25))
    this.sun = new THREE.DirectionalLight('#ffe4bb', 2.15)
    this.sun.position.set(-18, 30, 10); this.sun.castShadow = true
    this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize)
    this.sun.shadow.camera.left = -38; this.sun.shadow.camera.right = 38
    this.sun.shadow.camera.top = 42; this.sun.shadow.camera.bottom = -38
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 100
    this.sun.shadow.bias = -0.00035; this.sun.shadow.normalBias = 0.025
    this.scene.add(this.sun, this.sun.target)

    this.buildBasin()
    this.buildRoute()
    this.buildDistricts()
    this.buildMonument()
    this.buildCliffs()
    this.buildFigures()
    this.buildWorkshopSource()
    this.buildRingLatch()
    this.buildQuietSquare()
    this.buildFinalTrace()
    this.scene.traverse(obj => {
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh && mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const material of mats) if ((material as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
          const m = material as THREE.MeshStandardMaterial
          this.fadeMaterials.push({ material: m, color: m.color.clone(), emissive: m.emissive.clone() })
        }
      }
    })
  }

  update(dt: number, focus: THREE.Vector3, fading = this.fading): void {
    this.time += dt
    this.sun.position.set(focus.x - 18, focus.y + 30, focus.z + 12)
    this.sun.target.position.copy(focus)
    for (let i = 0; i < this.sway.length; i += 1) {
      const obj = this.sway[i]
      const amount = Math.max(0, 1 - fading * 1.25)
      obj.rotation.z = Math.sin(this.time * (0.55 + (i % 5) * 0.12) + i * 1.7) * 0.035 * amount
      obj.rotation.x = Math.cos(this.time * 0.42 + i * 0.8) * 0.018 * amount
    }
  }

  stepMovers(_elapsed: number): void {}

  setFading(amount: number): void {
    this.fading = THREE.MathUtils.clamp(amount, 0, 1)
    const grey = new THREE.Color('#77756f')
    for (const item of this.fadeMaterials) {
      const target = item.color.clone().lerp(grey, this.fading * 0.75)
      item.material.color.copy(target)
      item.material.emissive.copy(item.emissive).multiplyScalar(1 - this.fading * 0.72)
    }
    const scene = this.scene.background as THREE.Color
    scene.copy(this.baseBackground).lerp(new THREE.Color('#777773'), this.fading * 0.7)
    const fog = this.scene.fog as THREE.Fog
    fog.color.copy(scene)
    fog.near = 46 + this.fading * 8
    fog.far = 112 - this.fading * 18
  }

  setPuzzle(progress: number, noise: number, open: boolean): void {
    if (this.latchBar) {
      this.latchBar.position.y = open ? 5.1 : 1.1 + progress * 0.68
      ;(this.latchBar.material as THREE.MeshStandardMaterial).color.set(noise > 0.62 ? '#9c735d' : C.string)
      this.latchBar.rotation.z = noise > 0.62 ? Math.sin(this.time * 18) * 0.12 : 0
    }
    if (this.gate) {
      this.gate.position.y = open ? 5.5 : 0
      this.gate.rotation.z = open ? -0.15 : 0
    }
    if (this.sourceTone) this.sourceTone.scale.y = 1 + Math.sin(this.time * 2.2) * 0.05 * (1 - this.fading)
    if (this.traceTone) this.traceTone.visible = true
  }

  openPassage(): void {
    if (this.gateCollider) {
      this.physics.world.removeCollider(this.gateCollider, true)
      this.gateCollider = undefined
    }
  }

  resetPuzzle(): void {
    if (!this.gateCollider) {
      this.gateCollider = this.physics.world.createCollider(RAPIER.ColliderDesc.cuboid(4.5, 1.7, 0.33).setTranslation(0, 1.7, -7.72).setFriction(0.8))
    }
    if (this.gate) { this.gate.position.y = 0; this.gate.rotation.z = 0 }
    if (this.latchBar) { this.latchBar.position.y = 1.1; this.latchBar.rotation.z = 0 }
  }

  private buildBasin(): void {
    const groundMat = standard('#756b5c')
    const ground = new THREE.Mesh(new THREE.CylinderGeometry(36, 38, 1.2, 64), groundMat)
    ground.position.set(0, -0.6, 0); ground.receiveShadow = true; ground.castShadow = true; this.scene.add(ground)
    this.physics.addStaticCylinder(v(0, -0.6, 0), 36, 1.2)
    const inset = new THREE.Mesh(new THREE.CylinderGeometry(26, 28, 0.08, 64), standard('#807663'))
    inset.position.y = 0.02; inset.receiveShadow = true; this.scene.add(inset)
    // A few worn bands make the civic circle legible without turning the street into a HUD marker.
    for (const radius of [12.5, 13.2]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.11, 6, 96), standard('#8d7f67'))
      band.rotation.x = Math.PI / 2; band.position.set(7, 0.12, -9); this.scene.add(band)
    }
    this.addWalkway(0, 9.4, 7.5, 30, '#93856d')
    this.addWalkway(0, -14.2, 9.2, 13, '#a09680')
    // Civic route joins the partial Ring Street; each slab remains a safe continuous walking surface.
    const points = [v(0, 0.05, 2), v(1.5, 0.05, -3), v(4, 0.05, -8), v(8, 0.05, -12), v(10, 0.05, -16), v(4, 0.05, -20), v(0, 0.05, -24)]
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i], b = points[i + 1], d = new THREE.Vector3().subVectors(b, a)
      const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5)
      const slab = box(this.scene, v(6.2, 0.22, d.length() + 0.35), mid, standard(i < 3 ? '#91836d' : '#9e927a'))
      slab.rotation.y = Math.atan2(d.x, d.z)
      this.physics.addStaticBox(slab.position.clone().add(v(0, -0.11, 0)), v(6.2, 0.22, d.length() + 0.35), slab.quaternion)
    }
  }

  private addWalkway(x: number, z: number, width: number, length: number, color: string): void {
    box(this.scene, v(width, 0.18, length), v(x, 0.04, z), standard(color))
    this.physics.addStaticBox(v(x, -0.05, z), v(width, 0.18, length))
  }

  private buildRoute(): void {
    // Repeated bronze inlay plates evoke a civic measure, not a quest arrow.
    const inlay = standard('#70654f', 0.68, 0.22)
    for (let z = 12; z > -26; z -= 3.4) {
      const p = box(this.scene, v(0.075, 0.025, 1.15), v(0, 0.145, z), inlay, false)
      p.receiveShadow = false
    }
    // Low plinths at route edges define the playable lane and give the road a deliberate rhythm.
    for (const side of [-1, 1]) {
      for (let z = 12; z > -4; z -= 5.5) {
        box(this.scene, v(0.45, 0.44, 0.55), v(side * 4.5, 0.22, z), standard(C.darkStone))
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 5, 20), standard(C.bronze))
        ring.position.set(side * 4.5, 0.47, z); ring.rotation.x = Math.PI / 2; this.scene.add(ring)
      }
    }
  }

  private buildDistricts(): void {
    const positions = [
      [-8, 12, 4.6, 8.5], [8, 11, 4.5, 9], [-8.5, 4, 5, 9], [8.2, 3, 4.2, 8],
      [-9.5, -1.5, 5.2, 9], [10, -2, 4.3, 8], [16, -5, 5, 9], [-15, 1, 6.5, 12], [17, 7, 5, 10],
    ] as const
    positions.forEach(([x, z, w, h], i) => this.addSoundHouse(x, z, w, h, i))
    // Hanging cord/woven awnings shape the street overhead and cast a soft, deliberate shadow.
    for (let i = 0; i < 6; i += 1) {
      const z = 12 - i * 3.1
      const awning = box(this.scene, v(6.1, 0.12, 1.45), v(0, 5.5 + (i % 2) * 0.35, z), standard(i % 2 ? '#887461' : '#9b8470'))
      awning.rotation.z = (i % 2 ? -1 : 1) * 0.035
      this.sway.push(awning)
      for (const x of [-3.1, 3.1]) cylinderBetween(this.scene, v(x, 5.3, z), v(x * 1.45, 4.7, z + 0.15), 0.035, standard(C.string), 6)
    }
    // Raised workshop sign and instrument racks identify the maker's repair courtyard.
    const workshop = new THREE.Group(); workshop.position.set(-5.3, 0, 5.3); this.scene.add(workshop)
    box(workshop, v(3.5, 0.14, 0.9), v(0, 2.25, 0), standard(C.timber))
    for (let i = 0; i < 3; i += 1) {
      const curve = new THREE.Mesh(new THREE.TorusGeometry(0.55 + i * 0.12, 0.055, 7, 28, Math.PI), standard(C.bronze))
      curve.position.set(-0.65 + i * 0.64, 0.85 + (i % 2) * 0.35, -0.42); this.scene.add(curve)
      cylinderBetween(this.scene, v(-0.65 + i * 0.64, 0.5, -0.4), v(-0.65 + i * 0.64, 1.85, -0.4), 0.025, standard(C.string), 5)
    }
    // Suspended bridges and a broken continuation imply surrounding neighbourhoods.
    for (const [x, z, length] of [[-12, -4, 7], [15, 1, 8], [-18, -12, 9]] as const) {
      const bridge = box(this.scene, v(2.3, 0.22, length), v(x, 3.3, z), standard('#7e715f'))
      bridge.rotation.y = x < 0 ? 0.42 : -0.35
      for (const edge of [-1, 1]) {
        const start = v(x + edge * 1.15, 3.3, z - length * 0.45)
        const end = v(x + edge * 1.15, 4.7, z + length * 0.45)
        cylinderBetween(this.scene, start, end, 0.045, standard(C.bronze), 6)
      }
    }
  }

  private addSoundHouse(x: number, z: number, width: number, height: number, seed: number): void {
    const g = new THREE.Group(); g.position.set(x, 0, z); this.scene.add(g)
    const plaster = standard(seed % 3 === 0 ? '#b4a38a' : seed % 3 === 1 ? '#a99a83' : '#c4b69d')
    box(g, v(width, height, 3.5), v(0, height / 2, 0), plaster)
    this.physics.addStaticBox(v(x, height / 2, z), v(width, height, 3.5))
    const levels = height > 8 ? 3 : 2
    for (let level = 0; level < levels; level += 1) {
      const y = 1.5 + level * (height / levels)
      for (const side of [-1, 1]) {
        const xcol = side * (width * 0.42)
        box(g, v(0.19, height / levels + 0.3, 0.19), v(xcol, y, 1.82), standard(C.timber))
        const window = box(g, v(width * 0.17, Math.min(1.4, height / levels * 0.46), 0.11), v(side * width * 0.19, y + 0.2, 1.79), standard('#453c32'), false)
        window.castShadow = false
        // Circular carved acoustic openings give the facades a sound-making construction language.
        const aperture = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.075, 7, 24), standard(C.timber))
        aperture.position.set(side * width * 0.2, y + 0.2, 1.88); this.scene.add(aperture)
      }
      box(g, v(width + 0.35, 0.2, 3.9), v(0, y - 0.75, 0), standard(C.timber))
    }
    box(g, v(width + 0.8, 0.32, 4.1), v(0, height + 0.14, 0), standard(seed % 2 ? '#564638' : '#695340'))
    // Balcony, handrail and evenly spaced vertical strings.
    if (seed % 2 === 0) {
      box(g, v(width * 0.68, 0.22, 1.1), v(0, 3.2, 2.35), standard(C.timber))
      box(g, v(width * 0.68, 0.12, 0.12), v(0, 3.8, 2.85), standard(C.bronze))
      for (let i = -2; i <= 2; i += 1) cylinderBetween(g, v(i * 0.45, 3.3, 2.84), v(i * 0.45, 3.8, 2.84), 0.025, standard(C.string), 5)
    }
    // Slender acoustic buttresses, varied by house, avoid a uniform generic village silhouette.
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.3, height + 1.8, 7), standard(C.timber))
      pillar.position.set(side * (width * 0.58), (height + 1.8) / 2, -0.25); g.add(pillar)
      const cap = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.055, 6, 18), standard(C.bronze))
      cap.rotation.x = Math.PI / 2; cap.position.set(side * (width * 0.58), height + 0.65, -0.25); g.add(cap)
    }
  }

  private buildMonument(): void {
    const g = new THREE.Group(); g.position.set(14, 0, -18); g.rotation.z = -0.11; this.scene.add(g)
    const wood = standard('#493426', 0.68, 0.08)
    const bronze = standard('#9d8050', 0.4, 0.45)
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), wood)
    body.scale.set(4.1, 4.6, 2.25); body.position.set(0, 4.15, 0); body.castShadow = true; g.add(body)
    const shoulder = new THREE.Mesh(new THREE.LatheGeometry([
      new THREE.Vector2(0.5, 0), new THREE.Vector2(2.1, 0.35), new THREE.Vector2(2.8, 1.25),
      new THREE.Vector2(2.35, 2.2), new THREE.Vector2(1.1, 3.0), new THREE.Vector2(0.8, 3.55), new THREE.Vector2(0, 3.7),
    ], 28), bronze)
    shoulder.position.y = 4.15; g.add(shoulder)
    const neck = box(g, v(1.8, 19, 1.3), v(0, 13.4, 0), wood)
    neck.rotation.z = -0.11
    for (let i = 0; i < 8; i += 1) {
      const y = 7.5 + i * 1.55
      box(g, v(2.2, 0.12, 1.55), v(0, y, 0), bronze)
    }
    // Four actual district lines leave different points along the neck and terminate at distant supports.
    const endpoints = [v(-26, 8.5, 2), v(-13, 7.2, 28), v(25, 9.1, 8), v(6, 6.3, -31)]
    endpoints.forEach((end, i) => {
      const start = v((i - 1.5) * 0.36, 19.5 - i * 0.75, 0)
      cylinderBetween(g, start, end.clone().sub(g.position), 0.036 + i * 0.004, standard(i === 0 ? '#ae9870' : C.string), 6)
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 4.2, 7), wood)
      post.position.copy(end); post.position.y = 2.1; post.castShadow = true; this.scene.add(post)
      const yoke = box(this.scene, v(1.6, 0.16, 0.16), v(end.x, 4.25, end.z), bronze)
      yoke.rotation.y = 0.25 * (i - 1.5)
    })
    for (const side of [-1, 1]) cylinderBetween(g, v(side * 3.3, 1.4, 0), v(side * 0.8, 13, 0.8), 0.13, bronze, 8)
    const dais = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.7, 0.65, 16), standard('#665642'))
    dais.position.set(0, 0.32, 0); dais.receiveShadow = true; dais.castShadow = true; g.add(dais)
  }

  private buildCliffs(): void {
    const random = rng(5317)
    const rockMats = [standard('#514a40'), standard('#62584a'), standard('#766856')]
    for (let i = 0; i < 36; i += 1) {
      const a = (i / 36) * Math.PI * 2
      const radius = 34 + random() * 2.5
      const width = 2.4 + random() * 2.8
      const height = 11 + random() * 14
      const cliff = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), rockMats[i % rockMats.length])
      cliff.position.set(Math.cos(a) * radius, height * 0.36 - 2, Math.sin(a) * radius)
      cliff.scale.set(width, height, 2.5 + random() * 2.4)
      cliff.rotation.set(random() * 0.2, -a + Math.PI / 2, random() * 0.12)
      cliff.castShadow = true; cliff.receiveShadow = true; this.scene.add(cliff)
      const wallRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a + Math.PI / 2)
      this.physics.addStaticBox(v(Math.cos(a) * 33, 7, Math.sin(a) * 33), v(6.3, 14, 2.1), wallRotation)
      const edge = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 12 + random() * 7, 5), standard(C.bronze))
      edge.position.set(Math.cos(a) * (radius - 1.2), 8, Math.sin(a) * (radius - 1.2)); edge.rotation.z = (random() - 0.5) * 0.4; this.scene.add(edge)
    }
    // Distant continuation is deliberately lower-contrast and beyond the playable boundary.
    for (let i = 0; i < 22; i += 1) {
      const x = -33 + i * 3.1, z = -38 - random() * 18
      const h = 4 + random() * 13, w = 1.1 + random() * 2.5
      const tower = box(this.scene, v(w, h, w), v(x, h / 2, z), standard(i % 3 ? '#817768' : '#756c60'), false)
      tower.rotation.y = (random() - 0.5) * 0.3; tower.castShadow = false
      const tip = new THREE.Mesh(new THREE.ConeGeometry(w * 0.65, h * 0.2, 6), standard('#756c60'))
      tip.position.set(x, h + h * 0.1, z); this.scene.add(tip)
    }
  }

  private buildFigures(): void {
    // A handful of anonymous, deliberately simple residents: a repairer, a passer-by and seated families.
    const figure = (x: number, z: number, scale: number, robe: string, seated = false) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(scale); this.scene.add(g)
      const cloth = standard(robe), skin = standard('#ad8f70'), hair = standard('#322b24')
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, seated ? 0.25 : 0.48, 4, 8), cloth)
      torso.position.set(0, seated ? 0.8 : 0.88, 0); g.add(torso)
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), skin); head.position.set(0, seated ? 1.32 : 1.62, 0); g.add(head)
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.48), hair); cap.position.copy(head.position).add(v(0, 0.08, 0)); g.add(cap)
      if (seated) {
        box(g, v(0.75, 0.22, 0.7), v(0, 0.5, 0.12), standard(C.timber))
        box(g, v(0.16, 0.72, 0.18), v(-0.28, 0.35, 0.34), cloth)
        box(g, v(0.16, 0.72, 0.18), v(0.28, 0.35, 0.34), cloth)
      }
      return g
    }
    const craftsperson = figure(-5.6, 3.1, 1.05, '#71604e')
    craftsperson.rotation.y = Math.PI * 0.2
    const neighbor = figure(7, 9, 0.95, '#8e7760')
    neighbor.rotation.y = Math.PI
    for (const [x, z, color] of [[-3.1, -21.7, '#786b5b'], [-1.1, -21.3, '#8a7865'], [1.4, -21.8, '#6e665a'], [3.2, -22.2, '#887560']] as const) {
      figure(x, z, 0.95, color, true)
    }
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 0.5, 9), standard('#85765f'))
    pot.position.set(6, 0.25, 8); this.scene.add(pot)
  }

  private buildWorkshopSource(): void {
    const g = new THREE.Group(); g.position.set(-3.7, 0, 5.9); this.scene.add(g)
    const bronze = standard(C.bronze, 0.45, 0.4), wood = standard(C.timber)
    box(g, v(0.16, 2.45, 0.16), v(-0.82, 1.23, 0), wood)
    box(g, v(0.16, 2.45, 0.16), v(0.82, 1.23, 0), wood)
    box(g, v(1.9, 0.18, 0.25), v(0, 2.4, 0), bronze)
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.055, 8, 30), bronze)
    frame.position.set(0, 1.48, 0.02); this.sourceTone = frame; g.add(frame)
    for (let i = -2; i <= 2; i += 1) cylinderBetween(g, v(i * 0.23, 0.48, 0.16), v(i * 0.23, 2.25, 0.16), 0.022, standard(C.string), 5)
    const plinth = box(g, v(2.5, 0.18, 1.1), v(0, 0.1, 0.25), standard('#62513f'))
    plinth.castShadow = false
    this.interactables.push({ id: 'source', label: 'The mender’s string', position: v(-3.7, 1.1, 5.9), group: g })
  }

  private buildRingLatch(): void {
    const g = new THREE.Group(); g.position.set(2.6, 0, -7.0); this.scene.add(g)
    const bronze = standard(C.bronze, 0.38, 0.48), wood = standard(C.timber)
    box(g, v(0.32, 3.7, 0.38), v(-0.65, 1.85, 0), wood)
    box(g, v(0.32, 3.7, 0.38), v(0.65, 1.85, 0), wood)
    box(g, v(1.65, 0.22, 0.34), v(0, 3.52, 0), bronze)
    this.latchBar = box(g, v(1.25, 0.2, 0.18), v(0, 1.1, 0.05), bronze)
    for (let i = -2; i <= 2; i += 1) cylinderBetween(g, v(i * 0.22, 0.45, 0.23), v(i * 0.22, 3.35, 0.23), 0.023, standard(C.string), 5)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 8, 24), bronze)
    ring.position.set(0, 2.25, 0.26); g.add(ring)
    const counterweight = new THREE.Mesh(new THREE.SphereGeometry(0.33, 14, 12), standard('#6c5a42'))
    counterweight.position.set(0.95, 0.48, 0.12); g.add(counterweight)
    this.gate = new THREE.Group(); this.gate.position.set(0, 0, -7.72); this.scene.add(this.gate)
    box(this.gate, v(9, 3.4, 0.65), v(0, 1.7, 0), standard('#51483c'))
    for (const x of [-3.6, -2.4, -1.2, 0, 1.2, 2.4, 3.6]) box(this.gate, v(0.1, 3.05, 0.72), v(x, 1.72, 0.03), standard(C.bronze))
    this.gateCollider = this.physics.world.createCollider(RAPIER.ColliderDesc.cuboid(3.75, 1.7, 0.33).setTranslation(0, 1.7, -7.72).setFriction(0.8))
    this.interactables.push({ id: 'latch', label: 'The ring-street tension latch', position: v(2.6, 1.3, -7), group: g })
  }

  private buildQuietSquare(): void {
    const square = box(this.scene, v(17, 0.2, 11), v(0, 0.15, -22.3), standard('#a69c87'))
    square.receiveShadow = true
    this.physics.addStaticBox(v(0, 0.04, -22.3), v(17, 0.2, 11))
    const stone = standard('#756b5e'), bronze = standard('#8e7750')
    // Low benches form a generous arc with a quiet centre and views toward instrument and cliffs.
    for (let i = 0; i < 7; i += 1) {
      const a = Math.PI * 0.13 + (i / 6) * Math.PI * 0.74
      const x = Math.cos(a) * 6, z = -22.3 + Math.sin(a) * 3.6
      const seat = box(this.scene, v(1.7, 0.35, 0.75), v(x, 0.45, z), stone)
      seat.rotation.y = -a + Math.PI / 2
      for (const end of [-0.58, 0.58]) box(this.scene, v(0.14, 0.45, 0.62), v(x + end * Math.cos(-a + Math.PI / 2), 0.22, z + end * Math.sin(-a + Math.PI / 2)), bronze)
    }
    const lowCircle = new THREE.Mesh(new THREE.TorusGeometry(4.4, 0.06, 6, 72), bronze)
    lowCircle.rotation.x = Math.PI / 2; lowCircle.position.set(0, 0.29, -22.3); this.scene.add(lowCircle)
    for (let i = 0; i < 4; i += 1) {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 2.2 + i * 0.25, 7), standard(C.timber))
      stem.position.set(-2.4 + i * 1.6, 1.1 + i * 0.1, -18.2); this.scene.add(stem)
      const strand = cylinderBetween(this.scene, v(-2.4 + i * 1.6, 2.2, -18.2), v(-2.4 + i * 1.6, 4.2, -18.2), 0.025, bronze, 5)
      this.sway.push(strand)
    }
  }

  private buildFinalTrace(): void {
    const g = new THREE.Group(); g.position.set(0, 0, -26.2); this.scene.add(g)
    const stone = standard('#6d6254'), bronze = standard(C.string, 0.4, 0.46)
    box(g, v(1.7, 0.75, 1.4), v(0, 0.37, 0), stone)
    for (let i = 0; i < 3; i += 1) {
      const string = cylinderBetween(g, v(-0.46 + i * 0.46, 0.84, 0.18), v(-0.55 + i * 0.46, 2.6 + i * 0.4, 0.18), 0.033, bronze, 5)
      string.userData.homeY = string.position.y
      this.sway.push(string)
    }
    const mark = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.045, 6, 24), bronze)
    mark.position.set(0, 1.45, 0.22); mark.rotation.x = Math.PI / 2; g.add(mark); this.traceTone = mark
    this.interactables.push({ id: 'trace', label: 'A broken resonance trace', position: v(0, 0.8, -26.2), group: g })
  }
}
