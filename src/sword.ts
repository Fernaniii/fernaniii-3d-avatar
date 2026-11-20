import * as THREE from 'three'

export interface Sword {
  group: THREE.Group // add this to the hero's hand
}

/**
 * Nova's giant sword (about 2.3 units long, nearly as tall as he is).
 * The group's origin is the middle of the grip and the blade points along +Y;
 * its sharp edges (and the cross-guard) run along Z. Parent it to the hand and
 * aim it by setting `group.quaternion` (abilities.ts does this every frame).
 */
export function createSword(): Sword {
  const group = new THREE.Group()
  const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.5, ...extra })

  // Blade: a flat pointed shape, extruded to give it a little thickness
  const outline = new THREE.Shape()
  outline.moveTo(-0.13, 0)
  outline.lineTo(0.13, 0)
  outline.lineTo(0.13, 1.5)
  outline.lineTo(0, 1.75) // tip
  outline.lineTo(-0.13, 1.5)
  outline.closePath()
  const bladeGeo = new THREE.ExtrudeGeometry(outline, { depth: 0.06, bevelEnabled: false })
  bladeGeo.translate(0, 0, -0.03) // centre the thickness around z = 0
  // Turn it a quarter turn about its length so the two SHARP EDGES run along the
  // Z axis (and the flat faces look along X). The ability code relies on this:
  // it points the Z axis in the direction of each swing, so the edge leads the cut.
  bladeGeo.rotateY(Math.PI / 2)
  const blade = new THREE.Mesh(bladeGeo, mat(0xdfe6f2, { metalness: 0.7, roughness: 0.3 }))
  blade.position.y = 0.2

  // Glowing orange line down the middle of the flat face
  const glow = new THREE.Mesh(
    new THREE.BoxGeometry(0.075, 1.3, 0.05),
    mat(0xff7a1a, { emissive: 0xff7a1a, emissiveIntensity: 1.6 }),
  )
  glow.position.y = 0.2 + 0.8

  // Cross-guard (wide along the edges, like a real sword), grip and pommel
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.62), mat(0xff7a1a))
  guard.position.y = 0.16
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.34, 8), mat(0x2a2f3d))
  grip.position.y = -0.05
  const pommel = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), mat(0xff7a1a))
  pommel.position.y = -0.26

  group.add(blade, glow, guard, grip, pommel)
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true
  })
  return { group }
}
