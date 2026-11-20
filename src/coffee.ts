import * as THREE from 'three'

export interface Mug {
  group: THREE.Group // add this to the hero's hand
  rim: THREE.Object3D // top of the mug, where the steam rises from
}

/**
 * A low-poly coffee mug. The mug stands along its local +Y axis with its
 * base at the origin, so parent it to the hand and tilt it with `group.rotation`.
 */
export function createMug(): Mug {
  const group = new THREE.Group()
  const mat = (color: number) =>
    new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.6 })

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.075, 0.2, 10), mat(0xf4f1ea))
  body.position.y = 0.1

  // Orange band (hero's accent color)
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.092, 0.084, 0.05, 10), mat(0xff7a1a))
  band.position.y = 0.1

  // Dark coffee surface just below the rim
  const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.01, 10), mat(0x4a2c17))
  coffee.position.y = 0.185

  // Handle: a small torus on the side
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.016, 6, 10), mat(0xf4f1ea))
  handle.position.set(0.1, 0.1, 0)

  group.add(body, band, coffee, handle)
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true
  })

  const rim = new THREE.Object3D()
  rim.position.y = 0.2
  group.add(rim)

  return { group, rim }
}
