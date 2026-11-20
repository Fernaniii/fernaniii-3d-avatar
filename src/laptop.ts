import * as THREE from 'three'

/** The code that gets "typed" on the laptop screen. Edit it freely. */
const CODE = [
  'const hero = {',
  "  name: 'Fernaniii',",
  "  skill: 'CSS',",
  '};',
  '',
  'function launch() {',
  '  jetpack.ignite();',
  "  return 'liftoff!';",
  '}',
]
const FULL_TEXT = CODE.join('\n')

/** Total number of characters the typing animation reveals. */
export const CODE_LENGTH = FULL_TEXT.length

// Splits a line into keywords, strings, words, spaces and single symbols
const TOKEN = /(\b(?:const|function|return)\b|'[^']*'|\w+|\s+|.)/g

/** Very small syntax highlighter: returns a color for each token. */
function colorOf(tok: string) {
  if (/^(const|function|return)$/.test(tok)) return '#ff7b72' // keywords
  if (tok.startsWith("'")) return '#a5d6ff' // strings
  if (tok === 'launch' || tok === 'ignite') return '#d2a8ff' // function names
  return '#c9d1d9' // everything else
}

export interface Laptop {
  group: THREE.Group
  /** Redraws the screen showing the first `chars` characters; `t` blinks the caret. */
  setTyped: (chars: number, t: number) => void
}

/**
 * Builds a floating desk with a laptop whose screen is a canvas texture.
 * The screen faces +Z-ish (set the group's rotation to aim it at the camera).
 */
export function createLaptop(): Laptop {
  const group = new THREE.Group()
  const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.6, metalness: 0.1, ...extra })
  const silver = mat(0xc4cbd6, { metalness: 0.6, roughness: 0.4 })
  const dark = mat(0x2a2f3d)
  const deskTop = 0.77 // height of the desk surface

  // --- Small round desk -------------------------------------------------
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, deskTop - 0.03, 8), dark)
  pedestal.position.y = (deskTop - 0.03) / 2
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 20), mat(0x14204a))
  top.position.y = deskTop - 0.025
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.015, 6, 28),
    mat(0xff7a1a, { emissive: 0xff7a1a, emissiveIntensity: 1.2 }),
  )
  rim.rotation.x = Math.PI / 2
  rim.position.y = deskTop
  group.add(pedestal, top, rim)

  // --- Laptop base + keys -----------------------------------------------
  const laptop = new THREE.Group()
  laptop.position.y = deskTop
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.62), silver)
  base.position.y = 0.025
  const keys = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.012, 0.36), dark)
  keys.position.set(0, 0.056, 0.07)
  laptop.add(base, keys)

  // --- Screen: hinged at the back edge, leaning back a little ------------
  const screen = new THREE.Group()
  screen.position.set(0, 0.05, -0.31)
  screen.rotation.x = -0.25
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.58, 0.04), silver)
  lid.position.y = 0.29
  screen.add(lid)

  // The display is a canvas we redraw as text is "typed"
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 320
  const ctx = canvas.getContext('2d')!
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const display = new THREE.Mesh(
    new THREE.PlaneGeometry(0.82, 0.51),
    new THREE.MeshBasicMaterial({ map: texture }),
  )
  display.position.set(0, 0.3, 0.0215) // just in front of the lid
  screen.add(display)

  // Glowing logo on the back of the lid
  const logo = new THREE.Mesh(
    new THREE.CircleGeometry(0.07, 12),
    new THREE.MeshBasicMaterial({ color: 0xff7a1a }),
  )
  logo.position.set(0, 0.3, -0.0215)
  logo.rotation.y = Math.PI
  screen.add(logo)

  laptop.add(screen)
  group.add(laptop)

  group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true
  })

  // --- Screen drawing ---------------------------------------------------
  let lastKey = ''
  const setTyped = (chars: number, t: number) => {
    const caretOn = Math.floor(t * 2.5) % 2 === 0
    const key = `${chars}|${caretOn}`
    if (key === lastKey) return // nothing changed, skip redrawing
    lastKey = key

    ctx.fillStyle = '#0d1117'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // Title bar
    ctx.fillStyle = '#161b22'
    ctx.fillRect(0, 0, canvas.width, 30)
    for (const [i, c] of ['#ff5f56', '#ffbd2e', '#27c93f'].entries()) {
      ctx.fillStyle = c
      ctx.beginPath()
      ctx.arc(18 + i * 20, 15, 6, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.font = '14px Consolas, "Courier New", monospace'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#8b949e'
    ctx.fillText('launch.ts', 200, 16)

    // Code text, colored token by token, limited to `chars` characters
    ctx.font = '600 20px Consolas, "Courier New", monospace'
    ctx.textBaseline = 'top'
    const charW = ctx.measureText('M').width
    let remaining = chars
    let y = 46
    let caretX = 16
    let caretY = y
    for (const line of CODE) {
      let x = 16
      for (const m of line.matchAll(TOKEN)) {
        if (remaining <= 0) break
        const shown = m[0].slice(0, remaining)
        ctx.fillStyle = colorOf(m[0])
        ctx.fillText(shown, x, y)
        x += shown.length * charW
        remaining -= shown.length
      }
      caretX = x
      caretY = y
      if (remaining <= 0) break
      remaining -= 1 // the newline counts as a typed character
      y += 28
    }
    if (caretOn) {
      ctx.fillStyle = '#58a6ff'
      ctx.fillRect(caretX + 2, caretY + 1, 10, 22)
    }
    texture.needsUpdate = true
  }
  setTyped(0, 0)

  // --- Stool for Nova + the arrangement ----------------------------------
  // The set is built in Nova's own frame: he sits at the origin facing +Z, the
  // desk is 1.12 in front of him, and the laptop is turned so its screen faces him.
  group.position.set(0, 0, 1.12)
  group.rotation.y = Math.PI
  const outer = new THREE.Group()
  outer.add(group)

  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.06, 14), mat(0xff7a1a))
  seat.position.y = 0.39 // seat top is at 0.42
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.36, 8), dark)
  stem.position.y = 0.18
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.04, 14), dark)
  foot.position.y = 0.02
  for (const m of [seat, stem, foot]) {
    m.castShadow = true
    outer.add(m)
  }

  return { group: outer, setTyped }
}
