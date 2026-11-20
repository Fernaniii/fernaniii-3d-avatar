import * as THREE from 'three'
import { updateIdle, type HeroRig } from './character'
import { createLaptop, CODE_LENGTH, type Laptop } from './laptop'
import { createMug, type Mug } from './coffee'
import { createSword, type Sword } from './sword'

export type AbilityId =
  | 'comet' | 'blaster' | 'shield' | 'dive' | 'walk' | 'run' | 'code' | 'fly' | 'boost' | 'power' | 'coffee'
  | 'battle' | 'fslash' | 'thrust' | 'hslash' | 'dslash' | 'jslash'

export interface AbilityDef {
  id: AbilityId
  name: string
  key: string // label shown in the UI
  code: string // KeyboardEvent.code used by main.ts (blaster uses a mouse click)
  cooldown: number // seconds, 0 = none
  toggle?: boolean // on/off ability (Sky Cruise) instead of a one-shot
  requires?: AbilityId // locked until this toggle ability is on (the sword skills need Battle Mode)
  description: string
}

/** Ability data shown in the left panel and used for cooldowns. */
export const ABILITIES: AbilityDef[] = [
  { id: 'comet', name: 'Comet Boost', key: 'Space (hold)', code: 'Space', cooldown: 0,
    description: 'Jetpack thrust launches the hero upward. Hold or tap repeatedly to stay airborne.' },
  { id: 'blaster', name: 'Star Blaster', key: 'Left Click', code: '', cooldown: 0,
    description: 'Fires a glowing energy bolt from the wrist gauntlet.' },
  { id: 'shield', name: 'Nova Shield', key: 'E', code: 'KeyE', cooldown: 8,
    description: 'A glowing energy dome surrounds the hero.' },
  { id: 'dive', name: 'Meteor Dive', key: 'Shift', code: 'Shift', cooldown: 5,
    description: 'A fast diving strike with a shockwave on landing.' },
  { id: 'walk', name: 'Walk', key: 'W A S D / Arrows', code: '', cooldown: 0,
    description: 'Hold the keys to walk on the spot in the middle of the arena; he turns to face the direction you press. Preview walks by itself.' },
  { id: 'run', name: 'Run', key: 'Shift + move', code: '', cooldown: 0,
    description: 'Hold Shift while moving to sprint on the spot: bigger strides, a little hop each step, pumping arms, forward lean and a streaming cape. Preview runs by itself.' },
  { id: 'code', name: 'Code Mode', key: 'C', code: 'KeyC', cooldown: 0, toggle: true,
    description: 'Toggle: Fernaniii sits on a stool in front of a laptop and keeps typing code.' },
  { id: 'coffee', name: 'Coffee Break', key: 'K', code: 'KeyK', cooldown: 0, toggle: true,
    description: 'Toggle: Fernaniii sips a steaming cup of coffee.' },
  { id: 'fly', name: 'Sky Cruise', key: 'F', code: 'KeyF', cooldown: 0, toggle: true,
    description: 'Toggle Superman-style flight: Fernaniii cruises in the middle of the arena. Hold Space for full thrust.' },
  { id: 'boost', name: 'Boost Mode', key: 'Shift + F', code: '', cooldown: 0, toggle: true, requires: 'fly',
    description: 'While cruising: a long glowing blue afterburner and a longer jetpack fire. The tank holds 10 s of boost; once it is used up it needs 3 s to recharge fully before you can boost again.' },
  { id: 'power', name: 'Power Up', key: 'Click his name', code: '', cooldown: 0, toggle: true,
    description: 'Fernaniii drops into a fighting stance and in 3 seconds his body glows with a golden Super Saiyan aura. A click on his name powers up for about 7 s; press and hold the name to keep the aura on until you click again.' },
  { id: 'battle', name: 'Battle Mode', key: 'B', code: 'KeyB', cooldown: 0, toggle: true,
    description: 'Toggle: Fernaniii draws a giant sword and keeps attacking on his own, picking moves at random. Star Blaster is off while it is on.' },
  // The five sword moves. Battle Mode picks them at random; the keys / Preview buttons force one.
  { id: 'fslash', name: 'Forward Slash', key: '1', code: 'Digit1', cooldown: 0, requires: 'battle',
    description: 'Sword raised overhead, then chopped down in front of him.' },
  { id: 'thrust', name: 'Thrust', key: '2', code: 'Digit2', cooldown: 0, requires: 'battle',
    description: 'Pulls the sword back and lunges forward with a stab.' },
  { id: 'hslash', name: 'Horizontal Slash', key: '3', code: 'Digit3', cooldown: 0, requires: 'battle',
    description: 'A wide sweep across his body from right to left.' },
  { id: 'dslash', name: 'Diagonal Slash', key: '4', code: 'Digit4', cooldown: 0, requires: 'battle',
    description: 'A cut from the upper right down to the lower left.' },
  { id: 'jslash', name: 'Jump Slash', key: '5', code: 'Digit5', cooldown: 0, requires: 'battle',
    description: 'Leaps into the air and crashes down with a heavy slash and a shockwave.' },
]

// How long each preview animation lasts (seconds)
// (comet, fly, code and coffee have no fixed length: they are driven by input / a toggle)
const DURATION: Record<AbilityId, number> = {
  comet: 0, blaster: 0.9, shield: 3.2, dive: 1.5, walk: 0, run: 0, code: 0, fly: 0, boost: 0, power: 0, coffee: 0,
  battle: 0, fslash: 1.0, thrust: 0.85, hslash: 0.95, dslash: 1.0, jslash: 1.7,
}

// Jetpack physics (units per second)
const THRUST = 22 // upward acceleration while thrusting
const GRAVITY = 9 // pulls the hero down when thrust stops
const MAX_RISE = 3.5 // top upward speed while holding thrust
const MAX_HOVER = 2.6 // ceiling so the hero stays in the camera view
const TAP_KICK = 4.5 // instant upward speed added by each key press
// Sky Cruise
const CRUISE_HEIGHT = 1.4 // altitude of the cruise pose (he stays in the middle)
const CRUISE_YAW = 1.8 // turns him side-on so the flying pose reads well from the default camera
// Boost Mode (inside Sky Cruise): a limited jetpack tank
const BOOST_TIME = 10 // seconds of boost on a full tank
const RECHARGE_TIME = 3 // seconds to refill an empty tank; boost needs a full one
const JET_LENGTH = 2.2 // length of the blue afterburner at full boost
const BLUE_HOT = new THREE.Color(0xd8f6ff) // blue glow particles: white-cyan when young...
const BLUE_COOL = new THREE.Color(0x2a7bff) // ...deep blue as they fade
// Power Up (click his name): fighting stance, then a golden aura
const POWER_RAMP = 3 // seconds for the aura to build up to full
const POWER_HOLD = 4 // a plain click keeps the aura this much longer, then he relaxes (long press keeps it)
const GOLD_BODY = 0xffc43a // the glow that lights his whole body
const GOLD_HAIR = new THREE.Color(0xffd23a) // his hair turns golden
const GOLD_HOT = new THREE.Color(0xfff3a0) // aura sparks: pale yellow when young...
const GOLD_COOL = new THREE.Color(0xffa800) // ...deep gold as they fade
// Walk / Run
const WALK_SPEED = 1.7 // units per second
const RUN_SPEED = 4.2
const WALK_RATE = 1.3 // full leg cycles (two steps) per second
const RUN_RATE = 2.4
const AUTO_TIME = 4.5 // seconds a Preview walk / run lasts
// Code Mode
const CODE_YAW = -1.79 // turns the whole sitting set so the screen is readable from the default camera
const CODE_CPS = 16 // characters typed per second
const SIT_DROP = 0.15 // how far the hips drop when he sits on the stool
// Coffee Break
const MUG_SCALE = 2.3 // makes the cup about as big as his boots
// Battle Mode
const BATTLE_YAW = 1.0 // faces him toward screen-right so the sword swings read well
const WAVE_LIFE = 0.9 // seconds a ground wave lives
const WAVE_SPEED = 6 // units per second

// The five sword moves Battle Mode cycles through
const ATTACKS = ['fslash', 'thrust', 'hslash', 'dslash', 'jslash'] as const
type AttackId = (typeof ATTACKS)[number]
const isAttack = (id: AbilityId): id is AttackId => (ATTACKS as readonly string[]).includes(id)
const UP = new THREE.Vector3(0, 1, 0)
const FORWARD = new THREE.Vector3(0, 0, 1)

// ---- small math helpers ---------------------------------------------
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const easeOut = (v: number) => 1 - (1 - v) * (1 - v)
const easeOutBack = (v: number) => {
  const c = 1.70158
  return 1 + (c + 1) * Math.pow(v - 1, 3) + c * Math.pow(v - 1, 2)
}

/**
 * Keyframes for the sword moves. Each key is
 * [time 0..1, armX, armZ, bladeAz, bladeEl, lean, height, yaw, lunge]:
 *  - armX / armZ: rotation of the sword arm, which decides where the hand is
 *    (armX negative = swung forward/up, armZ negative = out to his right)
 *  - bladeAz / bladeEl: where the blade points, in the body's frame. Az is the
 *    turn around the vertical (0 = ahead, + = toward his left, - = his right),
 *    El is the angle above the horizon (PI/2 = straight up, negative = down)
 *  - lean: forward tilt of the body, height: lift off the floor
 *  - yaw: extra body turn on top of the battle stance (+ = toward his left)
 *  - lunge: how far he steps forward along the way he faces
 * The sword's edge orientation is not keyed: aimSword() works it out.
 */
type Key = [number, number, number, number, number, number, number, number, number]
const IDLE: Key = [0, -0.9, -0.1, 0, 0.9, 0.08, 0, 0, 0] // the Battle Mode ready pose
const REST = (t: number): Key => [t, IDLE[1], IDLE[2], IDLE[3], IDLE[4], IDLE[5], 0, 0, 0]
const ATTACK_KEYS: Record<AttackId, Key[]> = {
  // Overhead chop straight down in front of him
  fslash: [
    IDLE,
    [0.28, -2.4, -0.1, 0, 1.75, -0.15, 0, -0.1, -0.1], // blade raised overhead, a little behind
    [0.42, -1.35, -0.1, 0, -0.55, 0.4, 0, 0.05, 0.35], // chop down and step in
    [0.62, -1.3, -0.1, 0, -0.6, 0.38, 0, 0.05, 0.35], // hold
    REST(1),
  ],
  // Pull back, then stab straight ahead
  thrust: [
    IDLE,
    [0.3, -0.3, -0.3, 0.15, 0.1, -0.05, 0, -0.2, -0.15], // hand drawn back to the hip
    [0.45, -1.5, -0.2, 0, 0.05, 0.3, 0, 0, 0.6], // arm straight out, lunge
    [0.65, -1.5, -0.2, 0, 0.05, 0.3, 0, 0, 0.6],
    REST(1),
  ],
  // Wide level sweep from his right to his left
  hslash: [
    IDLE,
    [0.3, -1.3, -1.0, -1.7, 0.1, 0, 0, -0.7, 0], // twisted right, blade out to the right
    [0.5, -1.3, 0.5, 1.2, 0.1, 0.1, 0, 0.8, 0.2], // swept across to the left
    [0.65, -1.3, 0.5, 1.2, 0.1, 0.1, 0, 0.8, 0.2],
    REST(1),
  ],
  // Cut from the upper right down to the lower left
  dslash: [
    IDLE,
    [0.3, -2.2, -0.8, -0.8, 1.35, -0.1, 0, -0.35, -0.05], // blade high on the right
    [0.48, -1.2, 0.3, 0.9, -0.5, 0.4, 0, 0.45, 0.35], // down across to the lower left
    [0.65, -1.2, 0.3, 0.9, -0.5, 0.4, 0, 0.45, 0.35],
    REST(1),
  ],
  // Crouch, leap with the sword raised, crash down
  jslash: [
    IDLE,
    [0.15, -1.2, -0.1, 0, 0.9, 0.3, -0.15, 0, 0], // crouch
    [0.38, -2.4, -0.1, 0, 1.75, -0.2, 2.2, 0, 0.3], // in the air, sword overhead
    [0.6, -1.3, -0.1, 0, -0.6, 0.5, 0, 0.05, 0.9], // slam down on landing
    [0.75, -1.3, -0.1, 0, -0.6, 0.5, 0, 0.05, 0.9],
    REST(1),
  ],
}
// When (0..1) each cut connects and throws its energy wave
const HIT_AT: Record<AttackId, number> = { fslash: 0.42, thrust: 0.45, hslash: 0.5, dslash: 0.48, jslash: 0.6 }

/** Smoothly interpolates between keyframes at time p (0..1). */
function sampleKeys(keys: Key[], p: number): Key {
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]
    const b = keys[i + 1]
    if (p <= b[0]) {
      const u = clamp01((p - a[0]) / (b[0] - a[0]))
      const e = u * u * (3 - 2 * u) // ease in-out
      return a.map((v, j) => v + (b[j] - v) * e) as Key // (index 0, the time, is unused)
    }
  }
  return keys[keys.length - 1]
}

interface Particle {
  blue: boolean // boost glow (blue, additive) instead of an orange flame
  gold: boolean // Power Up aura spark (gold, additive)
  mesh: THREE.Mesh
  vel: THREE.Vector3
  life: number
  maxLife: number
}
interface Bolt {
  group: THREE.Group
  life: number
  dir: THREE.Vector3 // travel direction (the way he was facing)
}
interface Shockwave {
  mesh: THREE.Mesh
  life: number
  size: number // 1 = normal ring, bigger = bigger ring
}
interface Wave {
  mesh: THREE.Mesh
  life: number
  dir: THREE.Vector3
  size: number
}

const BOLT_LIFE = 1.1
const SHOCK_LIFE = 0.8
const POOL_SIZE = 260 // boost flames live longer, so the pool needs to be bigger

/**
 * Plays ability animations on top of the idle pose and owns the effects
 * (flame particles, energy bolts, shield dome, shockwave rings).
 * All timing uses delta time (seconds), so speed is identical on any device.
 */
export class AbilityController {
  private rig: HeroRig
  private scene: THREE.Scene

  private active: { id: AbilityId; t: number } | null = null // body animation
  private shieldT = -1 // < 0 means the dome is off
  private cooldowns: Record<AbilityId, number> = {
    comet: 0, blaster: 0, shield: 0, dive: 0, walk: 0, run: 0, code: 0, fly: 0, boost: 0, power: 0, coffee: 0,
    battle: 0, fslash: 0, thrust: 0, hslash: 0, dslash: 0, jslash: 0,
  }

  // Walk / Run state. He steps on the spot in the middle of the arena (see stepMove / updateWalk)
  private heading = 0 // yaw he faces (0 = toward +Z, the camera's default side)
  private speed = 0 // current gait speed (0 = standing, WALK_SPEED, RUN_SPEED)
  private gait = 0 // leg-cycle phase in radians
  private inX = 0 // keyboard direction in world space (set by main.ts), decides which way he faces
  private inZ = 0
  private inRun = false
  private autoMove: { run: boolean; t: number } | null = null // Preview button demo

  // Jetpack hover state
  private alt = 0 // current height above the floor
  private vy = 0 // vertical speed
  private thrustHeld = false // Space is down
  private thrustTimer = 0 // Preview button: thrust for a short while
  private wingOpen = 0 // 0..1 smoothed wing / pose amount
  private diveBase = 0 // height Meteor Dive starts from

  // Boost Mode state (only while Sky Cruise is on)
  private boostOn = false
  private fuel = 1 // 1 = full tank, 0 = empty
  private boostBlend = 0 // 0..1 smoothed, drives the jets, flames and pose
  private jets: THREE.Group[] = [] // the blue afterburner cones, one per thruster

  // Power Up state (click / long-press his name)
  private powerOn = false
  private powerKeep = false // long press: stays on until clicked again
  private powerT = 0 // seconds since the power-up started
  private powerBlend = 0 // 0..1 fighting stance
  private aura = 0 // 0..1 how strongly he glows (ramps up over POWER_RAMP)
  private bodyMats: THREE.MeshStandardMaterial[] = [] // every non-glowing material on him (all get the gold glow)
  private hairBase = new THREE.Color()
  private auraGroup: THREE.Group // golden shells + light, follows the hero
  private auraShells: THREE.Mesh[] = []
  private auraRing: THREE.Mesh // pulsing ring on the floor
  private auraLight: THREE.PointLight

  // Sky Cruise state
  private flightOn = false
  private flightBlend = 0 // 0 = on the ground, 1 = fully cruising

  // Code Mode state (toggle)
  private laptop: Laptop // stool + desk + laptop
  private codeOn = false
  private codeBlend = 0 // 0 = standing, 1 = seated and typing
  private codeT = 0 // seconds since Code Mode started (drives the typing)

  // Coffee Break state (toggle)
  private mug: Mug
  private steam: THREE.Mesh[] = []
  private coffeeOn = false
  private coffeeBlend = 0
  private coffeeT = 0 // drives the sip cycle

  // Battle Mode state (toggle)
  private sword: Sword
  private waveGeo: THREE.BufferGeometry // crescent-shaped ground wave
  private waves: Wave[] = []
  private battleOn = false
  private battleBlend = 0 // 0 = relaxed, 1 = sword drawn, battle stance
  private autoDelay = 0.4 // seconds until the next automatic attack
  private lastAttack: AttackId | null = null
  // Sword aiming (see aimSword)
  private bladeDir = new THREE.Vector3(0, 1, 0) // last frame's blade direction
  private edgeDir = new THREE.Vector3(0, 0, 1) // the way the sharp edge faces
  private aimD = new THREE.Vector3()
  private aimV = new THREE.Vector3()
  private aimX = new THREE.Vector3()
  private aimBasis = new THREE.Matrix4()
  private aimQ = new THREE.Quaternion()
  private fwd = new THREE.Vector3()
  private firedBolt = false
  private landed = false
  private flameLevel = 0 // 0..1 how hard the thrusters burn this frame

  private bolts: Bolt[] = []
  private shockwaves: Shockwave[] = []
  private particles: Particle[] = []
  private emitAcc = 0
  private auraAcc = 0

  private dome: THREE.Group
  private domeMats: THREE.Material[] = []

  // Shared geometry for effects (created once, reused)
  private boltGeo = new THREE.SphereGeometry(0.12, 10, 8)
  private boltGlowGeo = new THREE.SphereGeometry(0.22, 10, 8)
  private ringGeo = new THREE.RingGeometry(0.9, 1.1, 48)
  private flameGeo = new THREE.IcosahedronGeometry(0.08, 0)
  private tmp = new THREE.Vector3()
  private tmpQ = new THREE.Quaternion()

  constructor(rig: HeroRig, scene: THREE.Scene) {
    this.rig = rig
    this.scene = scene
    // Yaw first, then pitch around the hero's own axis, so flying "nose first" works
    rig.root.rotation.order = 'YXZ'

    // Collect his materials (before the dome and props are added to the root) so
    // Power Up can light them up gold. Materials that already glow (emblem,
    // gauntlet) are left alone. emissiveIntensity stays 0 until the aura starts.
    const seen = new Set<THREE.Material>()
    rig.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      const m = o.material
      if (m instanceof THREE.MeshStandardMaterial && !seen.has(m) && m.emissive.getHex() === 0) {
        seen.add(m)
        m.emissive.setHex(GOLD_BODY)
        m.emissiveIntensity = 0
        this.bodyMats.push(m)
      }
    })
    this.hairBase.copy(rig.hairMat.color)

    // Nova Shield dome: translucent sphere + faint wireframe, follows the hero
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0x4fd1ff, emissive: 0x2aa8e0, emissiveIntensity: 0.6,
      transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
    })
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x9be7ff, wireframe: true, transparent: true, opacity: 0,
    })
    this.domeMats = [shellMat, wireMat]
    this.dome = new THREE.Group()
    this.dome.add(new THREE.Mesh(new THREE.SphereGeometry(1.5, 24, 16), shellMat))
    this.dome.add(new THREE.Mesh(new THREE.SphereGeometry(1.52, 12, 8), wireMat))
    this.dome.position.y = 1.2
    this.dome.visible = false
    rig.root.add(this.dome)

    // Super Saiyan aura: two stretched golden shells around the body, a point
    // light that lights the floor, and a ring on the ground. All additive, all
    // invisible until the power-up starts. (Gold sparks are particles, see emitAura.)
    this.auraGroup = new THREE.Group()
    this.auraGroup.position.y = 1.2
    this.auraGroup.visible = false
    const shell = (sx: number, sy: number, sz: number, opacity: number, color: number) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 20, 14),
        new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
          depthWrite: false, side: THREE.DoubleSide,
        }),
      )
      mesh.scale.set(sx, sy, sz)
      mesh.userData.base = [sx, sy, sz, opacity]
      this.auraGroup.add(mesh)
      this.auraShells.push(mesh)
    }
    shell(0.95, 1.55, 0.85, 0.28, 0xffd23a) // inner, brighter
    shell(1.15, 1.85, 1.05, 0.14, 0xffa800) // outer, softer
    this.auraLight = new THREE.PointLight(0xffc83a, 0, 7, 2)
    this.auraGroup.add(this.auraLight)
    rig.root.add(this.auraGroup)

    this.auraRing = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 1.05, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffc83a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide,
      }),
    )
    this.auraRing.rotation.x = -Math.PI / 2
    this.auraRing.position.y = 0.04
    this.auraRing.visible = false
    scene.add(this.auraRing)

    // Code Mode set (stool + desk + laptop). It is built in Nova's own frame
    // (he sits at the origin facing the laptop) and turned by CODE_YAW so the
    // screen can be read from the default camera. Hidden until used.
    this.laptop = createLaptop()
    this.laptop.group.rotation.y = CODE_YAW
    this.laptop.group.visible = false
    scene.add(this.laptop.group)

    // Coffee mug held in the left hand, plus a few steam puffs in the scene
    this.mug = createMug()
    this.mug.group.position.set(0, -0.68, 0.22) // at the hand, sticking out forward
    this.mug.group.visible = false
    rig.armL.add(this.mug.group)
    const steamGeo = new THREE.SphereGeometry(0.04, 6, 5)
    for (let i = 0; i < 8; i++) {
      const puff = new THREE.Mesh(
        steamGeo,
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }),
      )
      puff.visible = false
      scene.add(puff)
      this.steam.push(puff)
    }

    // Giant sword in the right hand (the gauntlet arm), hidden until Battle Mode
    this.sword = createSword()
    this.sword.group.position.set(0, -0.68, 0) // at the hand
    this.sword.group.visible = false
    rig.armR.add(this.sword.group)

    // Ground wave shape: an arc of a circle lying flat, bulging toward +Z (forward)
    this.waveGeo = new THREE.TorusGeometry(1, 0.07, 6, 24, Math.PI * 0.7)
    this.waveGeo.rotateZ(Math.PI / 2 - Math.PI * 0.35) // centre the arc on +Y
    this.waveGeo.rotateX(Math.PI / 2) // lay it flat: +Y becomes +Z

    // Pre-built pool of flame particles so we never allocate during animation
    for (let i = 0; i < POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(
        this.flameGeo,
        new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true }),
      )
      mesh.visible = false
      scene.add(mesh)
      this.particles.push({ mesh, vel: new THREE.Vector3(), life: 0, maxLife: 1, blue: false, gold: false })
    }

    // Boost afterburners: a glowing blue cone with a white-hot core, hanging off
    // each thruster nozzle and pointing the way the flames go (the nozzle's "down").
    // Hidden until boosting; its length follows boostBlend.
    const coneGeo = (radius: number, length: number) => {
      const g = new THREE.ConeGeometry(radius, length, 10, 1, true)
      g.rotateX(Math.PI) // apex pointing down (-Y)
      g.translate(0, -length / 2, 0) // base at the nozzle, apex `length` below it
      return g
    }
    const outerGeo = coneGeo(0.14, JET_LENGTH)
    const coreGeo = coneGeo(0.07, JET_LENGTH * 0.7)
    for (const tip of rig.thrusterTips) {
      const jet = new THREE.Group()
      jet.add(
        new THREE.Mesh(outerGeo, new THREE.MeshBasicMaterial({
          color: 0x3aa0ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending,
          depthWrite: false, side: THREE.DoubleSide,
        })),
        new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({
          color: 0xe6fbff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending,
          depthWrite: false, side: THREE.DoubleSide,
        })),
      )
      jet.visible = false
      tip.add(jet)
      this.jets.push(jet)
    }
  }

  /** Jetpack tank level: 1 = full (boost can start), 0 = empty. */
  boostFuel() {
    return this.fuel
  }

  /** Seconds of cooldown left for an ability (0 = ready). */
  cooldownLeft(id: AbilityId) {
    return this.cooldowns[id]
  }

  /** True while a toggle ability (Sky Cruise, Code Mode, Coffee Break) is switched on. */
  isOn(id: AbilityId) {
    return (
      (id === 'fly' && this.flightOn) ||
      (id === 'boost' && this.boostOn) ||
      (id === 'power' && this.powerOn) ||
      (id === 'code' && this.codeOn) ||
      (id === 'coffee' && this.coffeeOn) ||
      (id === 'battle' && this.battleOn)
    )
  }

  /** Space pressed: instant kick upward, and keep thrusting while held. */
  pressThrust() {
    if (!this.flightOn && this.codeBlend < 0.01 && this.battleBlend < 0.01 && this.powerBlend < 0.01) {
      this.vy = Math.min(Math.max(this.vy, 0) + TAP_KICK, 6)
    }
    this.thrustHeld = true // while cruising, holding Space makes the thrusters blaze
  }

  /** Space released: thrust stops and gravity takes over. */
  releaseThrust() {
    this.thrustHeld = false
  }

  /**
   * Keyboard movement, called every frame by main.ts. (x, z) is the wanted
   * direction in world space (already relative to the camera); (0, 0) = stand still.
   */
  setMoveInput(x: number, z: number, run: boolean) {
    this.inX = x
    this.inZ = z
    this.inRun = run
  }

  /** True when he is free to walk: not cruising, seated, fighting or diving. */
  private canMove() {
    return (
      !this.flightOn && !this.codeOn && !this.battleOn && !this.powerOn &&
      this.flightBlend < 0.001 && this.codeBlend < 0.001 && this.battleBlend < 0.001 &&
      this.powerBlend < 0.001 &&
      this.active?.id !== 'dive'
    )
  }

  /** Starts an ability if it's off cooldown. Returns true if it started. */
  trigger(id: AbilityId): boolean {
    if (this.cooldowns[id] > 0) return false
    const busy = this.active?.id === 'dive'

    // The sword moves only work in Battle Mode, and Star Blaster is off while it's on
    const requires = ABILITIES.find((a) => a.id === id)?.requires
    if (requires && !this.isOn(requires)) return false
    if (id === 'blaster' && this.battleBlend > 0.01) return false

    if (id === 'comet') {
      // Preview button: a short thrust, as if Space were held for ~1.4 s
      if (busy || this.codeBlend > 0.01 || this.battleBlend > 0.01 || this.powerBlend > 0.01) return false
      this.thrustTimer = 1.4
      this.vy = Math.min(Math.max(this.vy, 0) + TAP_KICK, 6)
      return true
    }

    // Power Up from its panel card behaves like a click on his name
    if (id === 'power') return this.powerPress(false)

    // Boost Mode (only reachable while cruising, see `requires` above): toggles
    // on, but only with a completely full tank; toggling off stops the burn early
    if (id === 'boost') {
      if (this.boostOn) {
        this.boostOn = false
        return true
      }
      if (this.fuel < 0.999) return false // still recharging
      this.boostOn = true
      return true
    }

    // Preview buttons for Walk / Run: a lap around the arena by itself.
    // Pressing a movement key hands control back to the keyboard.
    if (id === 'walk' || id === 'run') {
      if (!this.canMove()) return false
      this.autoMove = { run: id === 'run', t: 0 }
      return true
    }

    // The toggles. Sky Cruise, Code Mode and Coffee Break each take over the
    // body, so switching one on ends the others (flight and Code Mode snap
    // off at once; Code Mode <-> Coffee Break cross-fade).
    if (id === 'fly') {
      if (busy) return false
      this.flightOn = !this.flightOn
      if (this.flightOn) this.snapOff({ code: true, coffee: true, battle: true, power: true })
      return true
    }
    if (id === 'code') {
      if (busy) return false
      this.codeOn = !this.codeOn
      if (this.codeOn) {
        this.snapOff({ battle: true, power: true })
        this.coffeeOn = false
        this.flightOn = false
        this.flightBlend = 0
        this.alt = 0
        this.vy = 0
      }
      return true
    }
    if (id === 'coffee') {
      if (busy) return false
      this.coffeeOn = !this.coffeeOn
      if (this.coffeeOn) {
        this.snapOff({ battle: true, power: true })
        this.codeOn = false
        this.flightOn = false
        this.flightBlend = 0
      }
      return true
    }
    if (id === 'battle') {
      if (busy) return false
      this.battleOn = !this.battleOn
      if (this.battleOn) {
        // Battle Mode takes over the whole body, so end everything else at once
        this.snapOff({ code: true, coffee: true, power: true })
        this.flightOn = false
        this.flightBlend = 0
        this.alt = 0
        this.vy = 0
      }
      return true
    }

    if (isAttack(id)) {
      // Forcing one sword move (key or Preview button): only between attacks,
      // once the sword is fully drawn
      if (this.active || this.battleBlend < 0.95) return false
      this.startAttack(id)
      return true
    }

    this.cooldowns[id] = ABILITIES.find((a) => a.id === id)!.cooldown

    if (id === 'shield') {
      this.shieldT = 0 // the shield is an overlay and can run alongside others
    } else {
      if (id === 'dive') {
        this.diveBase = this.alt // dive starts from the current height
        // Dive takes over the body, so end any hover, cruise, seat, coffee or sword first
        this.alt = 0
        this.vy = 0
        this.flightOn = false
        this.flightBlend = 0
        this.snapOff({ code: true, coffee: true, battle: true, power: true })
      }
      this.active = { id, t: 0 } // replaces any other body animation
      this.firedBolt = false
      this.landed = false
    }
    return true
  }

  /**
   * The name was clicked (keep = false) or pressed and held (keep = true).
   *  - Off: starts the power-up (fighting stance, aura builds over 3 s). A click
   *    lasts about 7 s; a long press keeps it on.
   *  - Already on: a long press locks it on (if it was a timed one), anything else switches it off.
   * Returns true if something changed.
   */
  powerPress(keep: boolean): boolean {
    if (this.powerOn) {
      if (keep && !this.powerKeep) this.powerKeep = true
      else this.powerOn = false
      return true
    }
    if (this.active?.id === 'dive') return false
    // The stance takes over the whole body, so end everything else at once
    this.snapOff({ code: true, coffee: true, battle: true })
    this.flightOn = false
    this.flightBlend = 0
    this.alt = 0
    this.vy = 0
    this.powerOn = true
    this.powerKeep = keep
    this.powerT = 0
    return true
  }

  /** Instantly switches Code Mode, Coffee Break, Battle Mode and/or Power Up off (no fade). */
  private snapOff(which: { code?: boolean; coffee?: boolean; battle?: boolean; power?: boolean }) {
    if (which.power) {
      this.powerOn = false
      this.powerBlend = 0
    }
    if (which.battle) {
      this.battleOn = false
      this.battleBlend = 0
    }
    if (which.code) {
      this.codeOn = false
      this.codeBlend = 0
    }
    if (which.coffee) {
      this.coffeeOn = false
      this.coffeeBlend = 0
    }
  }

  /** Call once per frame. dt = seconds since last frame, elapsed = total seconds. */
  update(dt: number, elapsed: number) {
    // 1. Reset to the idle pose; abilities below modify it
    updateIdle(this.rig, elapsed)

    // 2. Cooldowns tick down
    for (const id of Object.keys(this.cooldowns) as AbilityId[]) {
      this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt)
    }

    // 3. Body animation (blaster / dive / sword moves, on top of the toggles)
    this.flameLevel = 0

    // In Battle Mode he never stops: after a short pause he starts a different,
    // randomly chosen sword move
    if (this.battleOn && this.battleBlend > 0.95 && !this.active) {
      this.autoDelay -= dt
      if (this.autoDelay <= 0) this.startAttack(this.randomAttack())
    }

    // Advance the running animation's clock first, so every pose below knows
    // whether a sword move is in progress
    let p = 0
    if (this.active) {
      this.active.t += dt
      p = this.active.t / DURATION[this.active.id]
      if (p >= 1) {
        this.active = null
        this.autoDelay = 0.1 + Math.random() * 0.3 // brief pause before the next move
      }
    }

    this.updateBoost(dt, elapsed) // jetpack tank + blue afterburners
    this.stepMove(dt) // walking / running: new floor position and heading
    this.updateFlight(dt, elapsed) // jetpack hover + Sky Cruise (sets the base body pose)
    this.updateWalk() // leg / arm swing on top of that base pose
    this.updateCode(dt, elapsed) // seated typing (when on)
    this.updateCoffee(dt, elapsed) // coffee sipping (when on)
    this.updateBattle(dt, elapsed) // sword + battle stance (when on)
    this.updatePower(dt, elapsed) // fighting stance + golden aura (when on)

    const id = this.active?.id
    if (id === 'blaster') this.poseBlaster(p)
    else if (id && isAttack(id)) this.poseAttack(id, p)
    else if (id === 'dive') this.poseDive(p)

    // 4. Effects
    this.updateShield(dt)
    this.emitFlames(dt)
    this.emitAura(dt)
    this.updateParticles(dt)
    this.updateBolts(dt)
    this.updateShockwaves(dt)
    this.updateWaves(dt)
  }

  // ---------------------------------------------------------- poses

  /**
   * Boost Mode, run every frame. The tank drains over BOOST_TIME while boosting
   * and refills over RECHARGE_TIME otherwise; boost can only start from full.
   * Boost always ends when Sky Cruise ends. The blue jets sputter as the tank
   * runs dry.
   */
  private updateBoost(dt: number, elapsed: number) {
    if (!this.flightOn) this.boostOn = false
    if (this.boostOn) {
      this.fuel -= dt / BOOST_TIME
      if (this.fuel <= 0) {
        this.fuel = 0
        this.boostOn = false // tank empty
      }
    } else {
      this.fuel = Math.min(1, this.fuel + dt / RECHARGE_TIME)
    }
    this.boostBlend += ((this.boostOn ? 1 : 0) - this.boostBlend) * Math.min(1, dt * 6)

    const sputter = this.boostOn && this.fuel < 0.12 ? 0.5 + 0.5 * Math.sin(elapsed * 55) : 1
    const len = this.boostBlend * sputter
    this.jets.forEach((jet, i) => {
      jet.visible = len > 0.02
      const w = 1 + 0.15 * Math.sin(elapsed * 45 + i * 2) // flickering width and length
      jet.scale.set(w, len * (1 + 0.08 * Math.sin(elapsed * 60 + i)), w)
    })
  }

  /**
   * Walk / Run, run every frame: works out the gait speed and the way he faces
   * from the keyboard (or a Preview). He stays in the middle of the arena and
   * moves on the spot, like a treadmill; only his legs, body and facing change.
   * Takeover poses (Sky Cruise, Code Mode, Battle Mode) and Meteor Dive stop it.
   */
  private stepMove(dt: number) {
    const diving = this.active?.id === 'dive'
    const free = this.canMove()
    let want: number | null = null // the yaw he should face while stepping, null = stand still
    let run = this.inRun

    if (this.inX * this.inX + this.inZ * this.inZ > 1e-6) {
      this.autoMove = null // the keyboard takes over from a Preview
      want = Math.atan2(this.inX, this.inZ)
    } else if (this.autoMove && free) {
      const a = this.autoMove
      a.t += dt
      if (a.t >= AUTO_TIME) {
        this.autoMove = null
      } else {
        want = this.heading // keep facing the same way
        run = a.run
      }
    }

    if (!free) {
      want = null
      this.autoMove = null
      if (!diving) this.heading *= Math.exp(-dt * 5) // turn back to front for the takeover poses
    }

    // Ease the gait speed toward walk / run / standing still
    const target = want !== null ? (run ? RUN_SPEED : WALK_SPEED) : 0
    this.speed += (target - this.speed) * (1 - Math.exp(-dt * (target > this.speed ? 9 : 12)))

    if (want !== null) {
      // Turn toward the wanted direction (shortest way round)
      const diff = want - this.heading
      this.heading += Math.atan2(Math.sin(diff), Math.cos(diff)) * (1 - Math.exp(-dt * 14))
    }
    this.heading = Math.atan2(Math.sin(this.heading), Math.cos(this.heading)) // keep in -PI..PI

    // Advance the leg cycle (faster strides when running)
    const run01 = clamp01((this.speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED))
    const rate = WALK_RATE + (RUN_RATE - WALK_RATE) * run01
    this.gait += dt * rate * Math.PI * 2 * clamp01(this.speed / WALK_SPEED)
  }

  /**
   * Walk / Run pose, layered on top of the base pose from updateFlight.
   * One gait with a "run" blend: legs swing with the knee lifting on the forward
   * swing, arms swing against the legs, the body bobs (with a short airborne
   * moment when running), leans forward and the cape streams back.
   */
  private updateWalk() {
    const r = this.rig
    r.root.rotation.y += this.heading // face the way he last moved

    // Legs only step on the ground (not while hovering with the jetpack)
    const u = clamp01(this.speed / WALK_SPEED) * (1 - this.wingOpen)
    if (u < 0.001) return
    const run = clamp01((this.speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED))
    const lerp = (a: number, b: number) => a + (b - a) * run
    const sw = Math.sin(this.gait) // + = left leg back, right leg forward
    const cw = Math.cos(this.gait)

    const legAmp = lerp(0.55, 0.95) * u
    const knee = lerp(0.55, 1.4) * u
    const armAmp = lerp(0.5, 1.0) * u
    r.legL.rotation.x += legAmp * sw
    r.legR.rotation.x -= legAmp * sw
    r.shinL.rotation.x += knee * Math.max(0, -cw) // knee folds while the leg swings forward
    r.shinR.rotation.x += knee * Math.max(0, cw)
    r.armL.rotation.x += -armAmp * sw - 0.3 * run * u // arms swing against the legs
    r.armR.rotation.x += armAmp * sw - 0.3 * run * u

    // Body: dips when the legs are spread (so the planted foot stays on the floor).
    // When running, every stride is a little hop: he leaves the ground while the
    // legs are spread and lands as they pass under him (|sin| = one arc per step)
    const spread = 0.72 * (1 - Math.cos(legAmp * sw)) * (1 - 0.75 * run)
    const hop = 0.3 * run * u * Math.abs(sw)
    r.root.position.y += -spread + hop
    const lean = lerp(0.04, 0.3) * u
    r.root.rotation.x += lean
    r.head.rotation.x -= lean * 0.6 // keep looking ahead
    r.body.rotation.y = -0.12 * sw * u * lerp(0.6, 1.2) // shoulders twist against the hips
    r.cape.rotation.x += lerp(0.12, 0.6) * u
    r.capeLower.rotation.x += lerp(0.1, 0.4) * u * (1 + 0.3 * Math.sin(this.gait * 2))
  }

  /**
   * Comet Boost (jetpack hover) + Sky Cruise, run every frame.
   *
   * Jetpack: simple physics. While thrusting (Space held) the hero accelerates
   * upward up to a ceiling and hovers there; each key press adds a kick, so
   * tapping repeatedly also keeps him aloft. Release and gravity pulls him down.
   *
   * Sky Cruise: flightBlend fades from 0 to 1, tipping the hero into a flying
   * pose while he floats in the middle of the arena.
   */
  private updateFlight(dt: number, elapsed: number) {
    const r = this.rig
    // No jetpack while diving or sitting at the laptop
    const busy =
      this.active?.id === 'dive' || this.codeBlend > 0.001 || this.battleBlend > 0.001 ||
      this.powerBlend > 0.001
    this.thrustTimer = Math.max(0, this.thrustTimer - dt)
    const thrusting = !busy && !this.flightOn && (this.thrustHeld || this.thrustTimer > 0)

    // --- Jetpack physics ---
    if (busy) {
      this.alt = 0
      this.vy = 0
    } else {
      this.vy += (thrusting ? THRUST - GRAVITY : -GRAVITY) * dt
      if (thrusting) this.vy = Math.min(this.vy, MAX_RISE)
      this.vy = Math.max(this.vy, -7) // terminal fall speed
      this.alt += this.vy * dt
      if (this.alt >= MAX_HOVER) {
        this.alt = MAX_HOVER // hovering at the ceiling
        this.vy = Math.min(this.vy, 0)
      }
      if (this.alt <= 0) {
        this.alt = 0
        this.vy = Math.max(this.vy, 0)
      }
    }

    // --- Cruise blend (0.9 s fade in/out, eased) ---
    const step = dt / 0.9
    const target = this.flightOn ? 1 : 0
    this.flightBlend += Math.max(-step, Math.min(step, target - this.flightBlend))
    const fb = this.flightBlend * this.flightBlend * (3 - 2 * this.flightBlend)

    // Wings and pose amount while airborne
    const airborne = this.alt > 0.05 || thrusting || fb > 0.01
    this.wingOpen += ((airborne ? 1 : 0) - this.wingOpen) * Math.min(1, dt * 8)
    const open = this.wingOpen
    const gnd = 1 - fb // weight of the "hovering" pose vs the cruise pose

    // --- Body placement ---
    const bob = this.alt > 0.3 ? 0.04 * Math.sin(elapsed * 6) : 0
    // Stays at the center, floating up and down gently while cruising
    r.root.position.set(0, this.alt * gnd + (CRUISE_HEIGHT + 0.12 * Math.sin(elapsed * 2)) * fb + bob, 0)
    // Pitch forward ~75 deg to fly horizontally, turned side-on to the camera
    r.root.rotation.set(1.3 * fb + 0.15 * open * gnd, CRUISE_YAW * fb, 0)
    const bb = this.boostBlend * fb // boost only counts while cruising
    r.root.rotation.x += 0.12 * bb // dips his nose a little more when boosting

    // --- Limbs ---
    r.wingL.scale.x = 0.15 + 0.85 * open
    r.wingR.scale.x = 0.15 + 0.85 * open
    r.legL.rotation.x = 0.4 * open * gnd + 0.12 * fb // legs trail behind
    r.legR.rotation.x = 0.3 * open * gnd + 0.2 * fb
    r.armL.rotation.x = 0.25 * fb // left arm at his side
    r.armL.rotation.z = (0.14 + 0.4 * open) * gnd + 0.1 * fb
    r.armR.rotation.x = Math.PI * 0.98 * fb // right fist stretched forward, Superman style
    r.armR.rotation.z = (-0.14 - 0.4 * open) * gnd - 0.05 * fb
    r.head.rotation.x = -0.85 * fb // lift the face to look ahead
    r.cape.rotation.x += 0.5 * open * gnd + (0.25 + 0.1 * Math.sin(elapsed * 14)) * fb
    r.capeLower.rotation.x += 0.3 * open * gnd + (0.2 + 0.15 * Math.sin(elapsed * 14 - 1)) * fb
    r.cape.rotation.x += 0.35 * bb // the cape streams harder at boost speed
    r.capeLower.rotation.x += 0.3 * bb

    // --- Thruster flames ---
    if (bb > 0.02) this.flameLevel = Math.max(this.flameLevel, this.boostBlend) // boost burns at full
    if (thrusting) this.flameLevel = 1
    if (fb > 0.05) this.flameLevel = Math.max(this.flameLevel, fb * (this.thrustHeld ? 1 : 0.5))
  }

  /**
   * Code Mode (toggle): a stool, desk and laptop pop in; Nova turns to face
   * the laptop (its screen faces him), sits with bent knees and keeps typing.
   * The code on the screen types out, pauses, then starts over.
   */
  private updateCode(dt: number, elapsed: number) {
    const r = this.rig
    const step = dt / 0.7
    this.codeBlend += Math.max(-step, Math.min(step, (this.codeOn ? 1 : 0) - this.codeBlend))
    const cb = this.codeBlend * this.codeBlend * (3 - 2 * this.codeBlend)

    const set = this.laptop.group
    if (this.codeBlend <= 0) {
      set.visible = false
      this.codeT = 0
      return
    }
    set.visible = true
    set.scale.setScalar(Math.max(0.001, easeOutBack(clamp01(this.codeBlend))))

    // Typing loop: type everything, hold for 2.5 s, clear, repeat
    this.codeT += dt
    const cycle = CODE_LENGTH / CODE_CPS + 2.5
    const local = (this.codeT - 0.6) % cycle // negative = not started yet
    const typed = local < 0 ? 0 : Math.min(CODE_LENGTH, local * CODE_CPS)
    this.laptop.setTyped(Math.floor(typed), this.codeT)

    // Pose: turn to the laptop, drop onto the stool, thighs forward, shins down
    const tap = Math.sin(elapsed * 22) * 0.09
    r.root.position.y -= SIT_DROP * cb
    r.root.rotation.y = CODE_YAW * cb
    r.legL.rotation.x = -Math.PI * 0.47 * cb
    r.legR.rotation.x = -Math.PI * 0.47 * cb
    r.shinL.rotation.x = Math.PI * 0.47 * cb
    r.shinR.rotation.x = Math.PI * 0.47 * cb
    // Look down at the screen, both hands tap the keys alternately
    r.head.rotation.x = 0.22 * cb
    r.armL.rotation.x = (-1.1 + tap) * cb
    r.armR.rotation.x = (-1.1 - tap) * cb
    r.armL.rotation.z = 0.14 * (1 - cb)
    r.armR.rotation.z = -0.14 * (1 - cb)
  }

  /**
   * Coffee Break (toggle): a mug appears in the left hand. Every 5 seconds he
   * raises it to his mouth, sips (mug tilts, head leans back), lowers it, and
   * holds it at chest height. Steam puffs rise from the cup the whole time.
   */
  private updateCoffee(dt: number, elapsed: number) {
    const r = this.rig
    const step = dt / 0.6
    this.coffeeBlend += Math.max(-step, Math.min(step, (this.coffeeOn ? 1 : 0) - this.coffeeBlend))
    const k = this.coffeeBlend * this.coffeeBlend * (3 - 2 * this.coffeeBlend)

    if (this.coffeeBlend <= 0.001) {
      this.mug.group.visible = false
      this.coffeeT = 0
      for (const puff of this.steam) puff.visible = false
      return
    }
    this.mug.group.visible = true
    this.mug.group.scale.setScalar(Math.max(0.001, easeOutBack(clamp01(this.coffeeBlend)) * MUG_SCALE))
    this.coffeeT += dt

    // How far the arm is raised (0 = hanging, 1 = mug at the mouth)
    const REST = 0.3
    const t = this.coffeeT % 5
    let level = REST
    if (t < 0.9) level = REST + (1 - REST) * easeOut(t / 0.9) // raise
    else if (t < 2.6) level = 1 // sip
    else if (t < 3.5) level = 1 - (1 - REST) * easeOut((t - 2.6) / 0.9) // lower
    const a = level * k

    // The cup is big (boot-sized), so the arm only comes up to horizontal and the
    // cup tips toward his face: that puts its rim right at his mouth
    r.armL.rotation.x = -1.55 * a
    r.armL.rotation.z = 0.14 * (1 - a) - 0.6 * a // in toward the face
    this.mug.group.rotation.x = 0.4 * a // tip the cup toward his mouth
    r.head.rotation.x += -0.18 * a * a // lean the head back a little for the sip

    // Steam: puffs rise from the rim, drift sideways and fade
    r.root.updateMatrixWorld(true)
    this.mug.rim.getWorldPosition(this.tmp)
    this.steam.forEach((puff, i) => {
      const age = (elapsed * 0.6 + i / this.steam.length) % 1
      puff.visible = true
      puff.position.set(
        this.tmp.x + Math.sin(age * 7 + i * 2) * 0.03,
        this.tmp.y + 0.05 + age * 0.4,
        this.tmp.z + Math.cos(i * 3) * 0.03,
      )
      puff.scale.setScalar((0.6 + age * 1.2) * MUG_SCALE)
      ;(puff.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - age) * k
    })
  }

  /**
   * Power Up, run every frame. Phase 1: he drops into a wide fighting stance
   * (legs apart, knees bent, fists up) in half a second. Phase 2: over POWER_RAMP
   * seconds the aura builds: his whole body glows gold, his hair turns golden,
   * two golden shells and a light appear, sparks rise and the cape lifts.
   * A plain click ends it after POWER_HOLD more seconds; a long press keeps it.
   */
  private updatePower(dt: number, elapsed: number) {
    const r = this.rig
    if (this.powerOn) {
      this.powerT += dt
      if (!this.powerKeep && this.powerT >= POWER_RAMP + POWER_HOLD) this.powerOn = false
    } else {
      this.powerT = 0
    }

    const step = dt / 0.5
    this.powerBlend += Math.max(-step, Math.min(step, (this.powerOn ? 1 : 0) - this.powerBlend))
    const pb = this.powerBlend * this.powerBlend * (3 - 2 * this.powerBlend)

    // The aura climbs smoothly to full over POWER_RAMP, then fades quickly when it ends
    const t = clamp01(this.powerT / POWER_RAMP)
    const goal = this.powerOn ? t * t * (3 - 2 * t) : 0
    this.aura = goal >= this.aura ? goal : this.aura + (goal - this.aura) * Math.min(1, dt * 3)
    const a = this.aura

    // --- Fighting stance ---
    if (pb > 0.001) {
      const toward = (cur: number, target: number) => cur + (target - cur) * pb
      r.root.rotation.y = toward(r.root.rotation.y, 0.7) // three-quarter view
      r.root.rotation.x += 0.12 * pb // leaning into it
      r.root.position.y -= 0.06 * pb // knees bent: body sinks a little
      r.legL.rotation.z = toward(r.legL.rotation.z, 0.5) // legs wide apart
      r.legR.rotation.z = toward(r.legR.rotation.z, -0.5)
      r.legL.rotation.x -= 0.3 * pb // thighs forward, shins back under him
      r.legR.rotation.x -= 0.3 * pb
      r.shinL.rotation.x += 0.45 * pb
      r.shinR.rotation.x += 0.45 * pb
      r.shinL.rotation.z = -0.5 * pb // keeps the shins pointing straight down
      r.shinR.rotation.z = 0.5 * pb
      r.armL.rotation.x = toward(r.armL.rotation.x, -1.3) // fists raised in guard
      r.armL.rotation.z = toward(r.armL.rotation.z, 0.35)
      r.armR.rotation.x = toward(r.armR.rotation.x, -1.1)
      r.armR.rotation.z = toward(r.armR.rotation.z, -0.35)
      r.head.rotation.x += 0.1 * pb // eyes on the opponent
      r.cape.rotation.x += 0.2 * pb
    }

    // --- Aura ---
    // Whole body glows gold, hair turns golden
    for (const m of this.bodyMats) m.emissiveIntensity = 0.28 * a // enough to glow, not enough to wash out the FJ logo
    r.hairMat.color.copy(this.hairBase).lerp(GOLD_HAIR, a)

    const visible = a > 0.005
    this.auraGroup.visible = visible
    this.auraRing.visible = visible
    if (!visible) return

    // The charging body trembles, and the cape is blown up and back by the energy
    r.root.position.x += Math.sin(elapsed * 70) * 0.012 * a
    r.root.position.y += Math.sin(elapsed * 83) * 0.008 * a
    r.cape.rotation.x += (0.5 + 0.12 * Math.sin(elapsed * 18)) * a
    r.capeLower.rotation.x += (0.35 + 0.15 * Math.sin(elapsed * 18 - 1)) * a

    // Shells flicker like flames: width and height wobble out of step
    this.auraShells.forEach((s, i) => {
      const [sx, sy, sz, opacity] = s.userData.base as number[]
      const wobble = 1 + 0.05 * Math.sin(elapsed * 21 + i * 2) + 0.03 * Math.sin(elapsed * 37 + i)
      s.scale.set(sx * wobble * (0.6 + 0.4 * a), sy * (1 + 0.08 * Math.sin(elapsed * 17 + i * 3)) * (0.6 + 0.4 * a), sz * wobble * (0.6 + 0.4 * a))
      ;(s.material as THREE.MeshBasicMaterial).opacity = opacity * a * (0.85 + 0.15 * Math.sin(elapsed * 30 + i))
    })
    this.auraLight.intensity = 10 * a * (0.9 + 0.1 * Math.sin(elapsed * 25))
    this.auraRing.position.x = r.root.position.x
    this.auraRing.position.z = r.root.position.z
    this.auraRing.scale.setScalar(1 + 0.12 * Math.sin(elapsed * 6) + 0.25 * a)
    ;(this.auraRing.material as THREE.MeshBasicMaterial).opacity = 0.5 * a
  }

  /** Gold sparks that rise around his body while the aura is up. */
  private emitAura(dt: number) {
    if (this.aura < 0.05) return
    this.auraAcc += this.aura * 130 * dt // sparks per second
    this.rig.root.updateMatrixWorld(true)
    const base = this.rig.root.position
    while (this.auraAcc >= 1) {
      this.auraAcc -= 1
      const p = this.particles.find((q) => q.life <= 0)
      if (!p) return // pool exhausted: skip
      const ang = Math.random() * Math.PI * 2
      const rad = 0.35 + Math.random() * 0.45
      p.mesh.position.set(base.x + Math.cos(ang) * rad, base.y + Math.random() * 1.2, base.z + Math.sin(ang) * rad)
      p.vel.set(Math.cos(ang) * 0.15, 1.8 + Math.random() * 2.2, Math.sin(ang) * 0.15) // rise like flames
      p.maxLife = 0.5 + Math.random() * 0.45
      p.life = p.maxLife
      p.blue = false
      p.gold = true
      const m = p.mesh.material as THREE.MeshBasicMaterial
      m.blending = THREE.AdditiveBlending
      m.depthWrite = false
      p.mesh.visible = true
    }
  }

  /**
   * Aims the blade along (az, el) in the body's frame (see Key) and turns it
   * about its own axis so the SHARP EDGE LEADS THE SWING.
   *
   * The blade is a flat plate with its two edges along the local Z axis (see
   * sword.ts). A cut should travel edge-first, so the edge axis follows the way
   * the blade's direction is changing from frame to frame: for a chop that puts
   * the edge pointing down the swing, for a sideways sweep it faces sideways,
   * and so on. The sword has two edges, so the axis may point either way.
   * During a thrust the blade moves along itself, so it keeps its last edge.
   */
  private aimSword(az: number, el: number) {
    const d = this.aimD.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
    const v = this.aimV.copy(d).sub(this.bladeDir)
    v.addScaledVector(d, -v.dot(d)) // keep only the sideways part of the motion
    if (v.lengthSq() > 1e-6) {
      v.normalize()
      if (v.dot(this.edgeDir) < 0) v.negate() // either end of the axis is an edge
      this.edgeDir.lerp(v, 0.5) // turn smoothly instead of snapping
    }
    this.edgeDir.addScaledVector(d, -this.edgeDir.dot(d)) // stay perpendicular to the blade
    if (this.edgeDir.lengthSq() < 1e-6) {
      this.edgeDir.crossVectors(d, UP)
      if (this.edgeDir.lengthSq() < 1e-6) this.edgeDir.crossVectors(d, FORWARD)
    }
    this.edgeDir.normalize()

    // Build the sword's orientation from its axes: X = Y x Z, Y = blade, Z = edge
    const x = this.aimX.crossVectors(d, this.edgeDir)
    this.aimBasis.makeBasis(x, d, this.edgeDir)
    this.aimQ.setFromRotationMatrix(this.aimBasis)
    // The sword is a child of the arm, so express this body-frame aim relative to the arm
    this.sword.group.quaternion.copy(this.rig.armR.quaternion).invert().multiply(this.aimQ)
    this.bladeDir.copy(d)
  }

  /**
   * Battle Mode (toggle): the giant sword appears in his right hand and he
   * takes a ready stance: turned side-on, knees bent, sword held up and forward.
   * (The attacks themselves are in poseAttack and start by themselves.)
   */
  private updateBattle(dt: number, elapsed: number) {
    const r = this.rig
    const step = dt / 0.6
    this.battleBlend += Math.max(-step, Math.min(step, (this.battleOn ? 1 : 0) - this.battleBlend))
    const bb = this.battleBlend * this.battleBlend * (3 - 2 * this.battleBlend)

    if (this.battleBlend <= 0.001) {
      this.sword.group.visible = false
      return
    }
    this.sword.group.visible = true
    this.sword.group.scale.setScalar(Math.max(0.001, easeOutBack(clamp01(this.battleBlend))))

    // Stance
    r.root.rotation.y = BATTLE_YAW * bb
    r.root.rotation.x = 0.08 * bb
    r.legL.rotation.x = -0.3 * bb // front foot forward
    r.legR.rotation.x = 0.35 * bb // back foot behind
    r.legL.rotation.z = 0.05 + 0.12 * bb
    r.legR.rotation.z = -0.05 - 0.12 * bb
    r.armL.rotation.x = -0.5 * bb // free hand forward for balance
    r.armL.rotation.z = 0.14 * (1 - bb) + 0.25 * bb
    r.cape.rotation.x += 0.15 * bb

    // Ready pose with a slight sway (while an attack runs, poseAttack takes over)
    if (!(this.active && isAttack(this.active.id))) {
      r.armR.rotation.x = -0.9 * bb + Math.sin(elapsed * 2) * 0.04
      r.armR.rotation.z = -0.14 * (1 - bb) - 0.1 * bb
      this.aimSword(0, IDLE[4])
    }
  }

  /** Starts one sword move (and remembers it, so the random picker can avoid repeats). */
  private startAttack(id: AttackId) {
    this.active = { id, t: 0 }
    this.landed = false
    this.lastAttack = id
  }

  /** A random sword move that is different from the last one. */
  private randomAttack(): AttackId {
    const choices = ATTACKS.filter((a) => a !== this.lastAttack)
    return choices[Math.floor(Math.random() * choices.length)]
  }

  /**
   * One sword move, played from its keyframes (see ATTACK_KEYS): hand position
   * from the arm angles, blade direction from aimSword, body lean / yaw / lunge /
   * jump from the other channels. When the cut lands it throws an energy wave.
   */
  private poseAttack(id: AttackId, p: number) {
    const r = this.rig
    const [, armX, armZ, bladeAz, bladeEl, lean, height, yaw, lunge] = sampleKeys(ATTACK_KEYS[id], p)

    r.armR.rotation.x = armX
    r.armR.rotation.z = armZ
    r.root.rotation.y = BATTLE_YAW + yaw
    r.root.rotation.x = lean
    // Step forward along the way he faces
    const fwd = this.fwd.set(Math.sin(r.root.rotation.y), 0, Math.cos(r.root.rotation.y))
    r.root.position.set(fwd.x * lunge, height, fwd.z * lunge)
    r.legL.rotation.x = -0.3 - 0.5 * lunge // lunging leg reaches out, back leg trails
    r.legR.rotation.x = 0.35 + 0.4 * lunge
    this.aimSword(bladeAz, bladeEl)

    if (p >= HIT_AT[id] && !this.landed) {
      this.landed = true
      const at = r.root.position
      const heading = r.root.rotation.y
      if (id === 'jslash') this.spawnShockwave(1.4, at) // the landing shakes the ground
      this.spawnWave({ fslash: 1, thrust: 0.7, hslash: 1.5, dslash: 1.1, jslash: 2 }[id], heading, at)
    }
  }

  /** Star Blaster: raise the right arm, fire a bolt, lower the arm. */
  private poseBlaster(p: number) {
    const r = this.rig
    const raise = clamp01(Math.min(p / 0.25, (1 - p) / 0.3))
    r.armR.rotation.x = -Math.PI / 2 * raise // swing forward
    r.armR.rotation.z = -0.14 * (1 - raise)
    r.body.rotation.y = -0.15 * raise // slight twist into the shot
    r.head.rotation.y = 0.15 * raise

    // Fire once, as the arm reaches full extension
    if (p >= 0.25 && !this.firedBolt) {
      this.firedBolt = true
      r.root.updateMatrixWorld(true) // make sure the muzzle position is current
      this.spawnBolt(r.gauntletTip.getWorldPosition(this.tmp), this.heading)
    }
  }

  /** Meteor Dive: leap up, slam down, ring shockwave on landing, recover. */
  private poseDive(p: number) {
    const r = this.rig
    let h = 0 // height
    let dive = 0 // 0..1 how much we're in the diving pose
    if (p < 0.3) {
      h = this.diveBase + 3.2 * easeOut(p / 0.3) // leap (from wherever the hero was hovering)
      dive = clamp01(p / 0.3) * 0.4
    } else if (p < 0.5) {
      const q = (p - 0.3) / 0.2
      h = (this.diveBase + 3.2) * (1 - q * q) // accelerate downward
      dive = 0.4 + 0.6 * q
      this.flameLevel = 1
    } else {
      dive = Math.max(0, 1 - (p - 0.5) / 0.25) // recover from the crouch
    }

    if (p >= 0.5 && !this.landed) {
      this.landed = true
      this.spawnShockwave()
    }

    const crouch = p >= 0.5 ? Math.max(0, 1 - (p - 0.5) / 0.3) : 0
    r.root.position.y = h
    r.root.rotation.x = 1.0 * dive // lean into the dive
    r.body.scale.y *= 1 - 0.12 * crouch
    r.armL.rotation.x = -Math.PI * 0.85 * dive // arms thrust forward
    r.armR.rotation.x = -Math.PI * 0.85 * dive
    r.legL.rotation.x = 0.5 * dive
    r.legR.rotation.x = 0.5 * dive
    r.wingL.scale.x = 0.15 + 0.5 * dive
    r.wingR.scale.x = 0.15 + 0.5 * dive
    r.cape.rotation.x += 0.7 * dive
    r.capeLower.rotation.x += 0.4 * dive
  }

  // -------------------------------------------------------- effects

  private updateShield(dt: number) {
    if (this.shieldT < 0) return
    this.shieldT += dt
    const total = DURATION.shield
    if (this.shieldT >= total) {
      this.shieldT = -1
      this.dome.visible = false
      return
    }
    this.dome.visible = true
    const grow = easeOutBack(clamp01(this.shieldT / 0.5))
    const fade = clamp01((total - this.shieldT) / 0.6) // fade out at the end
    const pulse = 1 + 0.02 * Math.sin(this.shieldT * 8)
    this.dome.scale.setScalar(Math.max(0.001, grow * pulse))
    ;(this.domeMats[0] as THREE.MeshStandardMaterial).opacity = 0.28 * fade
    ;(this.domeMats[1] as THREE.MeshBasicMaterial).opacity = 0.35 * fade
  }

  private spawnBolt(origin: THREE.Vector3, heading: number) {
    const group = new THREE.Group()
    const core = new THREE.Mesh(this.boltGeo, new THREE.MeshBasicMaterial({ color: 0xfff0b0 }))
    const halo = new THREE.Mesh(
      this.boltGlowGeo,
      new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.55 }),
    )
    group.add(core, halo)
    group.scale.set(1, 1, 2.2) // stretch along the travel direction
    group.position.copy(origin)
    group.rotation.y = heading // stretched along the way he is facing
    this.scene.add(group)
    this.bolts.push({ group, life: 0, dir: new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading)) })
  }

  private updateBolts(dt: number) {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]
      b.life += dt
      b.group.position.addScaledVector(b.dir, 14 * dt) // fly the way he faced, 14 units/s
      const k = clamp01((BOLT_LIFE - b.life) / 0.3) // shrink away at the end
      b.group.scale.set(k, k, 2.2 * k)
      if (b.life >= BOLT_LIFE) {
        this.scene.remove(b.group)
        b.group.traverse((o) => {
          if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose()
        })
        this.bolts.splice(i, 1)
      }
    }
  }

  /** A crescent of energy that slides forward along the floor. */
  private spawnWave(size: number, heading: number, at: THREE.Vector3) {
    const dir = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading))
    const mesh = new THREE.Mesh(
      this.waveGeo,
      new THREE.MeshBasicMaterial({
        color: size > 1.5 ? 0xffd27a : 0xffa040, transparent: true, opacity: 0.95,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    )
    mesh.position.set(at.x + dir.x * 0.8, 0.08, at.z + dir.z * 0.8)
    mesh.rotation.y = heading // turns the crescent's +Z to face `dir`
    mesh.scale.setScalar(size)
    this.scene.add(mesh)
    this.waves.push({ mesh, life: 0, dir, size })
  }

  private updateWaves(dt: number) {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i]
      w.life += dt
      const k = w.life / WAVE_LIFE
      w.mesh.position.addScaledVector(w.dir, WAVE_SPEED * dt)
      w.mesh.scale.setScalar(w.size * (1 + 0.6 * k)) // spreads out as it travels
      ;(w.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - k)
      if (k >= 1) {
        this.scene.remove(w.mesh)
        ;(w.mesh.material as THREE.Material).dispose()
        this.waves.splice(i, 1)
      }
    }
  }

  private spawnShockwave(size = 1, at?: THREE.Vector3) {
    const mesh = new THREE.Mesh(
      this.ringGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffa040, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false,
      }),
    )
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(at?.x ?? 0, 0.03, at?.z ?? 0)
    this.scene.add(mesh)
    this.shockwaves.push({ mesh, life: 0, size })
  }

  private updateShockwaves(dt: number) {
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i]
      s.life += dt
      const k = s.life / SHOCK_LIFE
      s.mesh.scale.setScalar(1 + 2.4 * s.size * easeOut(k)) // ring expands...
      ;(s.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k) // ...and fades
      if (k >= 1) {
        this.scene.remove(s.mesh)
        ;(s.mesh.material as THREE.Material).dispose()
        this.shockwaves.splice(i, 1)
      }
    }
  }

  /**
   * Spawns flame particles at each thruster nozzle while flameLevel > 0.
   * While boosting the fire shoots out faster and lives longer (so it is longer),
   * and a second stream of blue additive "glow" particles is added.
   */
  private emitFlames(dt: number) {
    if (this.flameLevel <= 0) return
    const bb = this.boostBlend
    const stretch = 1 + 0.5 * bb // boost: flames fly 1.5x faster and live 1.5x longer
    this.emitAcc += this.flameLevel * 70 * (1 + 0.6 * bb) * dt // particles per second per thruster
    this.rig.root.updateMatrixWorld(true)
    while (this.emitAcc >= 1) {
      this.emitAcc -= 1
      for (const tip of this.rig.thrusterTips) {
        this.spawnFlame(tip, false, stretch)
        if (bb > 0.2) this.spawnFlame(tip, true, stretch)
      }
    }
  }

  private spawnFlame(tip: THREE.Object3D, blue: boolean, stretch: number) {
    const p = this.particles.find((q) => q.life <= 0)
    if (!p) return // pool exhausted: skip
    tip.getWorldPosition(p.mesh.position)
    // Flames shoot out of the nozzle's own "down" direction, so they trail
    // behind the hero even when he is tilted (dive, cruise)
    tip.getWorldQuaternion(this.tmpQ)
    const speed = (2.5 + Math.random() * 1.5) * stretch * (blue ? 1.3 : 1)
    p.vel
      .set((Math.random() - 0.5) * 0.5, -speed, (Math.random() - 0.5) * 0.5)
      .applyQuaternion(this.tmpQ)
    p.maxLife = (0.35 + Math.random() * 0.25) * stretch * (blue ? 1.4 : 1)
    p.life = p.maxLife
    p.blue = blue
    p.gold = false
    const m = p.mesh.material as THREE.MeshBasicMaterial
    m.blending = blue ? THREE.AdditiveBlending : THREE.NormalBlending
    m.depthWrite = !blue
    p.mesh.visible = true
  }

  private updateParticles(dt: number) {
    const hot = new THREE.Color(0xffe066) // yellow when young
    const cool = new THREE.Color(0xff5a00) // orange as it dies
    for (const p of this.particles) {
      if (p.life <= 0) continue
      p.life -= dt
      if (p.life <= 0) {
        p.mesh.visible = false
        continue
      }
      const k = p.life / p.maxLife // 1 → 0
      p.mesh.position.addScaledVector(p.vel, dt)
      p.mesh.scale.setScalar(p.blue ? (0.5 + k) * 1.5 : p.gold ? (0.45 + k) * 1.3 : 0.4 + k)
      const m = p.mesh.material as THREE.MeshBasicMaterial
      if (p.blue) m.color.copy(BLUE_COOL).lerp(BLUE_HOT, k)
      else if (p.gold) m.color.copy(GOLD_COOL).lerp(GOLD_HOT, k)
      else m.color.copy(cool).lerp(hot, k)
      m.opacity = p.blue || p.gold ? k * 0.8 : k
    }
  }
}