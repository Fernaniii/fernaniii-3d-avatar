import * as THREE from 'three'

/**
 * Handles to every part that needs to move independently.
 * Everything that animates the hero (idle + abilities) only talks to this
 * interface, so you can later return the same shape from a loaded GLB model
 * (find the matching nodes by name) and nothing else has to change.
 */
export interface HeroRig {
  root: THREE.Group // whole hero: moved/tilted for jumps and dives
  body: THREE.Group // breathing scale lives here
  head: THREE.Group
  armL: THREE.Group // pivot at the shoulder
  armR: THREE.Group // right arm carries the blaster gauntlet
  legL: THREE.Group
  legR: THREE.Group
  shinL: THREE.Group // lower leg, a child of legL: the knee joint (bends when sitting)
  shinR: THREE.Group
  cape: THREE.Group // upper cape segment (pivot at the top edge)
  capeLower: THREE.Group // lower segment, child of `cape`, gives a flowing bend
  wingL: THREE.Group
  wingR: THREE.Group
  jetpack: THREE.Group
  thrusterTips: THREE.Object3D[] // where flame particles spawn
  gauntletTip: THREE.Object3D // where the energy bolt spawns
  hairMat: THREE.MeshStandardMaterial // shared by the whole hairdo (turns golden in the power-up)
}

const COLORS = {
  suit: 0x14204a, // deep midnight blue
  orange: 0xff7a1a,
  silver: 0xc4cbd6,
  dark: 0x2a2f3d,
  skin: 0xf2c9a0,
  hair: 0x15121c,
  mask: 0x0b0b10,
}

/** Flat-shaded standard material = the low-poly toy look. */
function mat(color: number, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness: 0.65,
    metalness: 0.08,
    ...extra,
  })
}

/** Small helper: a box mesh at a position. */
function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
  mesh.position.set(x, y, z)
  return mesh
}

/**
 * Builds Nova Strike from primitives and returns the rig.
 * The hero faces +Z and stands with his feet on y = 0 (total height ≈ 2.4).
 * "Right" means the hero's right, which is -X when you look at him head-on.
 *
 * >>> To use a GLB model instead, replace the body of this function with a
 * >>> GLTFLoader result and fill in the HeroRig fields from the model's nodes.
 */
export function createCharacter(): HeroRig {
  const suit = mat(COLORS.suit)
  const orange = mat(COLORS.orange)
  const silver = mat(COLORS.silver, { metalness: 0.6, roughness: 0.4 })
  const glow = mat(COLORS.orange, { emissive: 0xff7a1a, emissiveIntensity: 1.6 })

  const root = new THREE.Group()
  root.name = 'hero'
  const body = new THREE.Group()
  root.add(body)

  // ---------------------------------------------------------------- torso
  const torso = new THREE.Group()
  torso.position.y = 1.05
  torso.add(box(0.85, 0.75, 0.5, suit))
  // Orange shoulder pads
  torso.add(box(0.34, 0.2, 0.52, orange, 0.5, 0.38, 0))
  torso.add(box(0.34, 0.2, 0.52, orange, -0.5, 0.38, 0))
  // Belt + buckle
  torso.add(box(0.9, 0.12, 0.54, orange, 0, -0.3, 0))
  torso.add(box(0.16, 0.14, 0.04, silver, 0, -0.3, 0.28))
  // Chest emblem: the letters "FJ" in glowing orange, inside a circle.
  // The letters are built from thin boxes so they match the blocky low-poly style.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 6, 20), glow)
  ring.position.set(0, 0.1, 0.26)
  torso.add(ring)
  const logo = new THREE.Group()
  logo.position.set(0, 0.1, 0.265) // just in front of the chest, inside the ring
  const S = 0.035 // stroke thickness
  const stroke = (w: number, h: number, x: number, y: number) => logo.add(box(w, h, 0.03, glow, x, y, 0))
  // F (left): spine, top bar, middle bar. Letters are 0.2 tall and 0.09 wide.
  stroke(S, 0.2, -0.0825, 0) // spine
  stroke(0.09, S, -0.055, 0.0825) // top bar
  stroke(0.065, S, -0.0675, 0.005) // middle bar
  // J (right): spine, short top bar, bottom bar, little hook up on the left
  stroke(S, 0.2, 0.0825, 0) // spine
  stroke(0.065, S, 0.065, 0.0825) // top bar
  stroke(0.09, S, 0.055, -0.0825) // bottom bar
  stroke(S, 0.05, 0.0275, -0.0425) // hook
  torso.add(logo)
  body.add(torso)

  // Straps that tie the cape to the shoulder pads
  body.add(box(0.1, 0.06, 0.6, orange, 0.42, 1.42, -0.3))
  body.add(box(0.1, 0.06, 0.6, orange, -0.42, 1.42, -0.3))

  // ----------------------------------------------------------------- legs
  // Each leg = thigh (pivot at the hip) + shin with the boot (pivot at the knee)
  const makeLeg = (side: 1 | -1) => {
    const leg = new THREE.Group()
    leg.position.set(0.2 * side, 0.72, 0)
    leg.add(box(0.3, 0.38, 0.3, suit, 0, -0.19, 0)) // thigh
    const shin = new THREE.Group()
    shin.position.y = -0.36 // the knee
    shin.add(box(0.3, 0.1, 0.3, suit, 0, -0.05, 0))
    shin.add(box(0.36, 0.3, 0.48, orange, 0, -0.21, 0.06)) // boot
    leg.add(shin)
    return { leg, shin }
  }
  const { leg: legL, shin: shinL } = makeLeg(1)
  const { leg: legR, shin: shinR } = makeLeg(-1)
  body.add(legL, legR)

  // ----------------------------------------------------------------- arms
  const makeArm = (side: 1 | -1) => {
    const arm = new THREE.Group()
    arm.position.set(0.58 * side, 1.35, 0)
    arm.add(box(0.24, 0.6, 0.24, suit, 0, -0.3, 0))
    const hand = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), orange)
    hand.position.y = -0.68
    arm.add(hand)
    return arm
  }
  const armL = makeArm(1)
  const armR = makeArm(-1)
  body.add(armL, armR)

  // Energy gauntlet (blaster) on the right wrist
  const gauntlet = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.22, 8), silver)
  gauntlet.position.y = -0.5
  armR.add(gauntlet)
  const gauntletGlow = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 6, 14), glow)
  gauntletGlow.rotation.x = Math.PI / 2
  gauntletGlow.position.y = -0.4
  armR.add(gauntletGlow)
  const gauntletTip = new THREE.Object3D()
  gauntletTip.position.y = -0.85 // just beyond the hand
  armR.add(gauntletTip)

  // ----------------------------------------------------------------- head
  const head = new THREE.Group()
  head.position.y = 1.43
  const face = new THREE.Group() // head centre is 0.5 above the neck pivot
  face.position.y = 0.5
  head.add(face)

  face.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), mat(COLORS.skin)))

  // Domino mask: a band wrapped around the front of the head
  const maskMat = mat(COLORS.mask)
  maskMat.side = THREE.DoubleSide
  const mask = new THREE.Mesh(
    new THREE.CylinderGeometry(0.515, 0.515, 0.2, 14, 1, true, -0.42 * Math.PI, 0.84 * Math.PI),
    maskMat,
  )
  mask.position.y = 0.04
  face.add(mask)

  // White eyes + determined, slanted brows
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  for (const s of [1, -1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), eyeMat)
    eye.scale.set(1.2, 0.8, 0.5)
    eye.position.set(0.18 * s, 0.04, 0.5)
    face.add(eye)
    const brow = box(0.2, 0.05, 0.05, mat(COLORS.hair), 0.18 * s, 0.17, 0.5)
    brow.rotation.z = -0.35 * s // slant down toward the nose
    face.add(brow)
  }
  face.add(box(0.15, 0.03, 0.04, mat(COLORS.mask), 0, -0.22, 0.49)) // set mouth

  // Barber cut: short tapered sides and back with a neat, full top. No spikes.
  // All pieces share hairMat so the power-up can turn the whole cut golden.
  const hairMat = mat(COLORS.hair)
  // 1. Top cap: sits low and straight across the forehead (a clean hairline)
  face.add(new THREE.Mesh(new THREE.SphereGeometry(0.53, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.4), hairMat))
  // 2. Sides and back: a band that runs from one temple round the back of the head,
  //    ending in a straight, level edge at the nape like a fresh taper
  hairMat.side = THREE.DoubleSide // the band is an open tube, so it must show from both sides
  const sides = new THREE.Mesh(
    new THREE.CylinderGeometry(0.515, 0.515, 0.34, 18, 1, true, 0.48 * Math.PI, 1.04 * Math.PI),
    hairMat,
  )
  sides.position.y = 0.08 // spans from just below ear height up to the cap
  face.add(sides)
  // 3. The longer top: a slightly bigger, shallower layer lying over the cap. Its edge
  //    steps out from the tapered sides, which is what makes it read as a barber cut.
  const top = new THREE.Mesh(
    new THREE.SphereGeometry(0.565, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.34),
    hairMat,
  )
  top.scale.set(1, 1.05, 1.04)
  top.position.z = 0.02 // a touch forward, for a neat front line above the brows
  face.add(top)
  body.add(head)

  // ------------------------------------------------------------- jetpack
  const jetpack = new THREE.Group()
  jetpack.position.set(0, 1.1, -0.42)
  jetpack.add(box(0.6, 0.7, 0.25, silver))
  jetpack.add(box(0.5, 0.08, 0.27, orange, 0, 0.2, 0)) // stripe

  const thrusterTips: THREE.Object3D[] = []
  for (const s of [1, -1]) {
    const thruster = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.3, 8), mat(COLORS.dark))
    thruster.position.set(0.17 * s, -0.45, 0)
    jetpack.add(thruster)
    const tip = new THREE.Object3D()
    tip.position.set(0.17 * s, -0.62, 0)
    jetpack.add(tip)
    thrusterTips.push(tip)
  }

  // Fold-out wings: pivot at the pack's side, scaled on X to fold/unfold
  const makeWing = (side: 1 | -1) => {
    // A plate bolted flat onto the BACK of the pack (back face is at z = -0.125).
    // The hinge sits just inside the pack's edge, so when folded (scale.x = 0.15)
    // the wing is a small fin that stays within the pack's outline.
    const wing = new THREE.Group()
    wing.position.set(0.2 * side, 0, -0.125 - 0.02) // vertically centred on the pack
    wing.rotation.set(0, 0, 0.1 * side) // tips tilted up just a little
    wing.add(box(0.8, 0.5, 0.04, silver, 0.4 * side, 0, 0)) // almost as tall as the pack
    wing.add(box(0.14, 0.52, 0.05, orange, 0.73 * side, 0, 0)) // orange wingtip
    return wing
  }
  const wingL = makeWing(1)
  const wingR = makeWing(-1)
  jetpack.add(wingL, wingR)
  body.add(jetpack)

  // ---------------------------------------------------------------- cape
  // Two hinged segments: the lower one lags behind the upper for a flowing look.
  const capeMat = mat(COLORS.orange)
  capeMat.side = THREE.DoubleSide
  const cape = new THREE.Group()
  cape.position.set(0, 1.42, -0.6) // behind the jetpack, tied on by the straps
  cape.add(box(0.95, 0.5, 0.05, capeMat, 0, -0.25, 0))
  const capeLower = new THREE.Group()
  capeLower.position.y = -0.5
  capeLower.add(box(0.85, 0.45, 0.05, capeMat, 0, -0.225, 0))
  cape.add(capeLower)
  body.add(cape)

  // Every mesh in the hero casts a shadow
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true
  })

  return {
    root, body, head, armL, armR, legL, legR, shinL, shinR, cape, capeLower,
    wingL, wingR, jetpack, thrusterTips, gauntletTip, hairMat,
  }
}

/**
 * Idle pose: heroic stance with breathing and a swaying cape.
 * It sets EVERY animated value each frame, so it also acts as the "reset"
 * that ability animations then modify on top of.
 * @param t elapsed seconds
 */
export function updateIdle(rig: HeroRig, t: number) {
  const breathe = Math.sin(t * 2)
  rig.root.position.set(0, 0, 0)
  rig.root.rotation.set(0, 0, 0)
  rig.body.scale.set(1, 1 + 0.012 * breathe, 1)
  rig.head.position.y = 1.43 + 0.012 * breathe
  rig.head.rotation.set(0, Math.sin(t * 0.6) * 0.12, 0)

  rig.armL.rotation.set(0, 0, 0.14 + 0.02 * breathe)
  rig.armR.rotation.set(0, 0, -0.14 - 0.02 * breathe)
  rig.legL.rotation.set(0, 0, 0.05)
  rig.legR.rotation.set(0, 0, -0.05)
  rig.shinL.rotation.set(0, 0, 0)
  rig.shinR.rotation.set(0, 0, 0)

  // Wings folded in
  rig.wingL.scale.x = 0.15
  rig.wingR.scale.x = 0.15

  // Cape sway: positive X rotation swings the cape backwards (-Z)
  rig.cape.rotation.set(0.1 + Math.sin(t * 1.6) * 0.05, 0, 0)
  rig.capeLower.rotation.set(0.08 + Math.sin(t * 1.6 - 0.9) * 0.09, 0, 0)
}
