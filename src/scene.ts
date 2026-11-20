import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

/**
 * Everything the rest of the app needs from the 3D world.
 * main.ts adds the hero to `scene` and calls `render()` every frame.
 */
export interface Stage {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  render: () => void
}

/** Creates the renderer, camera, lights, floor and orbit controls inside `container`. */
export function createStage(container: HTMLElement): Stage {
  // --- Renderer -------------------------------------------------------
  // alpha: true lets the CSS gradient behind the canvas show through,
  // so light/dark mode is handled entirely by CSS.
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)) // cap for performance
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  container.prepend(renderer.domElement)

  // --- Scene & camera -------------------------------------------------
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100)
  camera.position.set(3.6, 2.6, 6.2)

  // --- Lights ---------------------------------------------------------
  // Hemisphere light = soft sky/ground ambient fill.
  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x30384a, 1.2)
  scene.add(hemi)

  // One directional "sun" that casts the shadow.
  const sun = new THREE.DirectionalLight(0xffffff, 2.4)
  sun.position.set(4, 8, 5)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -5
  sun.shadow.camera.right = 5
  sun.shadow.camera.top = 5
  sun.shadow.camera.bottom = -5
  sun.shadow.camera.near = 0.5
  sun.shadow.camera.far = 25
  sun.shadow.bias = -0.0005
  scene.add(sun)

  // --- Circular floor + glowing rim ----------------------------------
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1f2740, roughness: 0.9 })
  const floor = new THREE.Mesh(new THREE.CircleGeometry(3.2, 64), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  const rim = new THREE.Mesh(
    new THREE.RingGeometry(3.1, 3.2, 64),
    new THREE.MeshBasicMaterial({ color: 0xff7a1a, side: THREE.DoubleSide }),
  )
  rim.rotation.x = -Math.PI / 2
  rim.position.y = 0.005
  scene.add(rim)

  // Match the floor tone to the OS color scheme (the page background is CSS).
  const dark = window.matchMedia('(prefers-color-scheme: dark)')
  const applyTheme = () => {
    floorMat.color.set(dark.matches ? 0x1f2740 : 0xcfd6e6)
    hemi.intensity = dark.matches ? 1.0 : 1.4
  }
  applyTheme()
  dark.addEventListener('change', applyTheme)

  // --- Orbit controls -------------------------------------------------
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 1.2, 0) // look at the hero's chest
  controls.enableDamping = true // smooth inertia
  controls.enablePan = false
  controls.minDistance = 3.5 // limits keep the model in view
  controls.maxDistance = 11
  controls.maxPolarAngle = Math.PI / 2 - 0.05 // can't go under the floor
  controls.minPolarAngle = 0.25
  controls.update()

  // --- Resize handling ------------------------------------------------
  // ResizeObserver fires whenever the container changes size (window resize,
  // layout switch at 768px, ...) so the canvas always fills its column.
  const resize = () => {
    const w = container.clientWidth
    const h = container.clientHeight
    if (w === 0 || h === 0) return
    renderer.setSize(w, h, false) // false: CSS controls the canvas display size
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  new ResizeObserver(resize).observe(container)
  resize()

  const render = () => {
    controls.update()
    renderer.render(scene, camera)
  }

  return { scene, camera, renderer, controls, render }
}
