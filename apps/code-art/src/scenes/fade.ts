import { ShaderMaterial, type Material, type Object3D } from 'three'

/**
 * Sets every material under `root` to `opacity` of its own, so a whole
 * system can fade as one. Each material's opacity when first seen is kept as
 * its full strength, so faint orbit lines stay faint at full fade. Materials
 * are made transparent once, not per frame, since that recompiles them.
 */
export function fadeAll(root: Object3D, opacity: number): void {
  root.traverse((o) => {
    const found = (o as { material?: Material | Material[] }).material
    if (!found) return
    for (const m of Array.isArray(found) ? found : [found]) {
      if (m.userData.full === undefined) {
        m.userData.full = m.opacity
        m.transparent = true
        m.needsUpdate = true
      }
      m.opacity = (m.userData.full as number) * opacity
      // A shader material reads its opacity from a uniform, if it has one.
      if (m instanceof ShaderMaterial && m.uniforms.uOpacity)
        m.uniforms.uOpacity.value = m.opacity
    }
  })
}
