import './style.css'
import { createStage } from './scene'
import { createCharacter } from './character'
import { ABILITIES, AbilityController, type AbilityId } from './abilities'
import { buildPanel } from './ui'

const panelEl = document.querySelector<HTMLElement>('#panel')!
const viewport = document.querySelector<HTMLElement>('#viewport')!

// 1. Build the 3D world and put the hero in it
const stage = createStage(viewport)
const hero = createCharacter()
stage.scene.add(hero.root)

// 2. Abilities (animations + effects) and the left panel UI
const abilities = new AbilityController(hero, stage.scene)

/** Single entry point for every trigger: button, key or mouse. */
function fire(id: AbilityId) {
  if (abilities.trigger(id)) ui.flash(id)
}
// Clicking his name starts the power-up; pressing and holding it keeps it on
const ui = buildPanel(panelEl, fire, (keep) => {
  if (abilities.powerPress(keep)) ui.flash('power')
})

// 3. Keyboard: Space = Comet Boost, E = Nova Shield, Shift = Meteor Dive
// (Space is handled separately below because it is hold-to-fly, not one-shot.)
const keyMap = new Map<string, AbilityId>(
  ABILITIES.filter((a) => a.code && a.id !== 'comet').map((a) => [a.code, a.id]),
)
keyMap.set('ShiftLeft', 'dive')
keyMap.set('ShiftRight', 'dive')

// Walk / Run: WASD or the arrow keys move him, holding Shift while moving runs.
// `down` remembers which keys are currently held.
const down = new Set<string>()
const MOVE_KEYS: Record<string, [number, number]> = {
  // [forward, right] relative to the camera
  KeyW: [1, 0], ArrowUp: [1, 0],
  KeyS: [-1, 0], ArrowDown: [-1, 0],
  KeyA: [0, -1], ArrowLeft: [0, -1],
  KeyD: [0, 1], ArrowRight: [0, 1],
}
const isMoving = () => Object.keys(MOVE_KEYS).some((k) => down.has(k))

/** The wanted move direction in world space, turned to match where the camera looks. */
function moveInput(): [number, number] {
  let f = 0
  let s = 0
  for (const [code, [a, b]] of Object.entries(MOVE_KEYS)) {
    if (down.has(code)) {
      f += a
      s += b
    }
  }
  f = Math.max(-1, Math.min(1, f))
  s = Math.max(-1, Math.min(1, s))
  if (f === 0 && s === 0) return [0, 0]
  // "Forward" = from the camera toward the point it orbits, flattened onto the floor
  let fx = stage.controls.target.x - stage.camera.position.x
  let fz = stage.controls.target.z - stage.camera.position.z
  const len = Math.hypot(fx, fz) || 1
  fx /= len
  fz /= len
  return [fx * f - fz * s, fz * f + fx * s] // right-hand vector = (-fz, fx)
}

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return
  down.add(e.code)
  if (e.code in MOVE_KEYS) {
    e.preventDefault() // arrow keys would scroll the panel
    return
  }
  // Shift while moving means "run", and while cruising it is the Boost modifier
  // (Shift + F), so in both cases it must not also trigger Meteor Dive
  if (e.code.startsWith('Shift') && (isMoving() || abilities.isOn('fly'))) return
  // Shift + F while Sky Cruise is on = Boost Mode (plain F still toggles the cruise)
  if (e.code === 'KeyF' && e.shiftKey && abilities.isOn('fly')) {
    if (!e.repeat) fire('boost')
    return
  }
  if (e.code === 'Space') {
    e.preventDefault() // don't scroll / click a focused button
    if (!e.repeat) {
      abilities.pressThrust() // each press kicks upward; holding keeps thrusting
      ui.flash('comet')
    }
    return
  }
  const id = keyMap.get(e.code)
  if (!id || e.repeat) return
  fire(id)
})
window.addEventListener('keyup', (e) => {
  down.delete(e.code)
  if (e.code === 'Space') {
    e.preventDefault() // Firefox activates buttons on Space keyup
    abilities.releaseThrust()
  }
})
// If the window loses focus while Space is down we'd never get the keyup
window.addEventListener('blur', () => {
  abilities.releaseThrust()
  down.clear() // otherwise he'd keep walking until the keys are pressed again
})

// 4. Left click on the canvas = Star Blaster.
// Dragging rotates the camera, so only count it as a click if the pointer barely moved.
const canvas = stage.renderer.domElement
let downX = 0
let downY = 0
canvas.addEventListener('pointerdown', (e) => {
  downX = e.clientX
  downY = e.clientY
})
canvas.addEventListener('pointerup', (e) => {
  if (e.button === 0 && Math.hypot(e.clientX - downX, e.clientY - downY) < 5) fire('blaster')
})

// 5. Main loop. Using the real time between frames (delta time) keeps
// animation speed identical on 60 Hz and 144 Hz screens.
let last = performance.now()
let elapsed = 0
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.05) // clamp so a background tab doesn't cause a huge jump
  last = now
  elapsed += dt

  const [mx, mz] = moveInput()
  abilities.setMoveInput(mx, mz, down.has('ShiftLeft') || down.has('ShiftRight'))
  abilities.update(dt, elapsed)
  ui.update(
    (id) => abilities.cooldownLeft(id),
    (id) => abilities.isOn(id),
    () => abilities.boostFuel(),
  )
  stage.render()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
