import { ABILITIES, type AbilityId } from './abilities'

// ---------------------------------------------------------------------
// Skill bars (confidence level, 0-100). EDIT THIS LIST to match your own
// skills: change a name or number, add a line, or delete a line.
// ---------------------------------------------------------------------
const SKILLS: Array<[string, number]> = [
  ['CSS', 80],
  ['HTML', 85],
  ['JavaScript', 75],
  ['TypeScript', 65],
  ['SQL', 70],
]

export interface Panel {
  /** Briefly highlights an ability card (used when it's triggered by key). */
  flash: (id: AbilityId) => void
  /** Call every frame: refreshes the Preview buttons' cooldown state. */
  update: (
    cooldownLeft: (id: AbilityId) => number,
    isOn: (id: AbilityId) => boolean,
    fuel: () => number, // jetpack tank for Boost Mode, 0..1
  ) => void
}

/** Builds the left panel and wires the Preview buttons to `onPreview`. */
export function buildPanel(
  el: HTMLElement,
  onPreview: (id: AbilityId) => void,
  onName: (keep: boolean) => void, // his name was clicked (false) or pressed and held (true)
): Panel {
  el.innerHTML = `
    <span class="role">Sky Defender</span>
    <h1 class="hero-name" role="button" tabindex="0"
        title="Click: fighting stance + power-up. Press and hold: keep the power-up on.">Fernaniii</h1>
    <div class="name-hint">Click his name for a power-up · hold it to keep it on</div>
    <p class="bio">Born in a meteor storm, now guarding the skies of Starfall City.</p>

    <h2 class="section-title">Skills</h2>
    ${SKILLS.map(
      ([label, value]) => `
      <div class="stat" title="${label}: ${value}% confidence">
        <div class="stat-head"><span>${label}</span><span class="stat-value">${value}%</span></div>
        <div class="track"><div class="fill" style="--v:${value}"></div></div>
      </div>`,
    ).join('')}

    <h2 class="section-title">Abilities</h2>
    ${ABILITIES.map(
      (a) => `
      <article class="ability" data-id="${a.id}">
        <div class="ability-head">
          <span class="ability-name">${a.name}</span>
          <kbd>${a.key}</kbd>
        </div>
        <div class="ability-cd">${a.toggle ? 'Toggle on / off' : a.cooldown > 0 ? `Cooldown: ${a.cooldown}s` : 'No cooldown'}${a.requires ? ` · ${ABILITIES.find((x) => x.id === a.requires)!.name} only` : ''}</div>
        <p class="ability-desc">${a.description}</p>
        ${a.id === 'boost' ? '<div class="track fuel" title="Jetpack fuel"><div class="fill"></div></div>' : ''}
        <button class="preview-btn" type="button">Preview</button>
      </article>`,
    ).join('')}
  `

  // Animate the stat bars in on the next frame (CSS transitions width)
  requestAnimationFrame(() => el.classList.add('ready'))

  const cards = new Map<AbilityId, HTMLElement>()
  const buttons = new Map<AbilityId, HTMLButtonElement>()
  const labels = new Map<AbilityId, string>() // last text, to avoid needless DOM writes
  for (const a of ABILITIES) {
    const card = el.querySelector<HTMLElement>(`.ability[data-id="${a.id}"]`)!
    const btn = card.querySelector<HTMLButtonElement>('.preview-btn')!
    btn.addEventListener('click', () => onPreview(a.id))
    cards.set(a.id, card)
    buttons.set(a.id, btn)
  }

  // His name is a button: a quick click = power-up, press and hold (0.6 s) = keep it on
  const nameEl = el.querySelector<HTMLElement>('.hero-name')!
  const HOLD_MS = 600
  let holdTimer: number | undefined
  nameEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    window.clearTimeout(holdTimer)
    holdTimer = window.setTimeout(() => {
      holdTimer = undefined // fired: the release below must not also count as a click
      onName(true)
    }, HOLD_MS)
  })
  nameEl.addEventListener('pointerup', () => {
    if (holdTimer === undefined) return
    window.clearTimeout(holdTimer)
    holdTimer = undefined
    onName(false) // released before the hold time: a normal click
  })
  const cancelHold = () => {
    window.clearTimeout(holdTimer)
    holdTimer = undefined
  }
  nameEl.addEventListener('pointerleave', cancelHold)
  nameEl.addEventListener('pointercancel', cancelHold)
  nameEl.addEventListener('contextmenu', (e) => e.preventDefault()) // long press on touch screens
  nameEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation() // Space must not also fire Comet Boost
      if (!e.repeat) onName(false)
    }
  })
  let lastPowered = false

  const fuelFill = el.querySelector<HTMLElement>('.fuel .fill') // Boost Mode's tank gauge
  let lastFuel = -1

  const timers = new Map<AbilityId, number>()
  return {
    flash(id) {
      const card = cards.get(id)!
      card.classList.add('is-active')
      window.clearTimeout(timers.get(id))
      timers.set(id, window.setTimeout(() => card.classList.remove('is-active'), 900))
    },
    update(cooldownLeft, isOn, fuel) {
      // The name glows gold while the power-up is on
      const powered = isOn('power')
      if (powered !== lastPowered) {
        lastPowered = powered
        nameEl.classList.toggle('powered', powered)
      }
      // Fuel gauge: only touch the DOM when the whole percent changes
      const pct = Math.round(fuel() * 100)
      if (fuelFill && pct !== lastFuel) {
        lastFuel = pct
        fuelFill.style.width = `${pct}%`
      }
      for (const a of ABILITIES) {
        const left = cooldownLeft(a.id)
        const on = isOn(a.id)
        // Locked until the ability it needs is on (sword skills need Battle Mode, Boost needs Sky Cruise)
        const locked = a.requires ? !isOn(a.requires) : false
        const needs = a.requires ? ABILITIES.find((x) => x.id === a.requires)!.name : ''
        const recharging = a.id === 'boost' && !on && pct < 100 // boost needs a full tank
        // Toggles show their on/off state, locked skills say what they need,
        // others show a cooldown countdown
        const text = locked
          ? `Needs ${needs}`
          : recharging
            ? `Recharging ${pct}%`
            : a.toggle
              ? on ? 'Turn off' : 'Turn on'
              : left > 0 ? `Cooldown ${left.toFixed(1)}s` : 'Preview'
        if (labels.get(a.id) !== text) {
          labels.set(a.id, text)
          const btn = buttons.get(a.id)!
          btn.textContent = text
          btn.disabled = locked || recharging || left > 0
          cards.get(a.id)!.classList.toggle('is-on', on)
        }
      }
    },
  }
}
