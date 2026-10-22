// Soft tissue on springs: each jiggle bone (breast.L/.R, glute.L/.R in the dealer model) follows a point mass tied to
// where the bone would sit in the pose, with its own natural frequency and damping. Body acceleration makes it lag and
// bounce; gravity makes it settle lower when the body bends or lies down (relative to the upright rest pose, which is
// already the shape at rest). The bone is moved, not rotated, so the weighted skin and the clothes on it follow.
import * as THREE from "three";

// f: natural frequency, Hz; z: damping ratio; max: largest offset, m; sag: settling under gravity when turned, m
export const JIGGLE_DEFAULT = [
  { bone: "breastL", f: 3, z: .3, max: .025, sag: .02 }, { bone: "breastR", f: 3, z: .3, max: .025, sag: .02 },
  { bone: "gluteL", f: 4, z: .35, max: .015, sag: .006 }, { bone: "gluteR", f: 4, z: .35, max: .015, sag: .006 }
];

export class Jiggle {
  constructor(body, spec = JIGGLE_DEFAULT) {
    this.b = body; this.on = true; this.gain = 1; const up = new THREE.Vector3(0, -1, 0);
    // the moving mass sits where the tissue is, not at the bone's root (for the breasts the root is at the spine):
    // the weighted centre of the skin the bone carries, kept in the bone's own frame, so a turn of the trunk moves it too
    const skin = body.layerMeshes.skin.find(m => m.isSkinnedMesh && m.name === "Body");
    body.root.updateMatrixWorld(true);
    this.items = spec.filter(s => body.bones[s.bone] && body.bones[s.bone].parent).map(s => {
      const B = body.bones[s.bone], q = B.parent.getWorldQuaternion(new THREE.Quaternion()), c = new THREE.Vector3();
      if (skin) { const g = skin.geometry, P = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bi = skin.skeleton.bones.indexOf(B), v = new THREE.Vector3(); let W = 0;
        for (let i = 0; i < P.count; i++) for (let j = 0; j < 4; j++) if (si.getComponent(i, j) === bi) { const w = sw.getComponent(i, j); if (w > .05) { c.addScaledVector(v.fromBufferAttribute(P, i).applyMatrix4(skin.bindMatrix), w); W += w; } }
        if (W) c.multiplyScalar(1 / W); else c.setFromMatrixPosition(B.matrixWorld); }
      else c.setFromMatrixPosition(B.matrixWorld);
      const off = B.worldToLocal(c.clone());
      return { ...s, B, rest: B.position.clone(), off, gLocal: up.clone().applyQuaternion(q.invert()), p: null, v: new THREE.Vector3() };
    });
  }
  get count() { return this.items.length; }
  reset() { for (const it of this.items) it.p = null; }
  // after the pose is applied and the world matrices are current
  update(dt) {
    if (!this.items.length) return;
    const T = new THREE.Vector3(), e = new THREE.Vector3(), q = new THREE.Quaternion(), d = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
    for (const it of this.items) {
      const B = it.B, P = B.parent;
      B.position.copy(it.rest); B.updateMatrixWorld(true); T.copy(it.off).applyMatrix4(B.matrixWorld);       // the tissue's centre in the pose
      if (!this.on) { it.p = null; continue; }
      // where gravity would settle it: the change of "down" in the parent's frame since the rest pose
      P.getWorldQuaternion(q); e.copy(it.gLocal).applyQuaternion(q).negate().add(down).multiplyScalar(it.sag * this.gain);
      if (!it.p) { it.p = T.clone().add(e); it.v.set(0, 0, 0); }
      const w = 2 * Math.PI * it.f, h = 1 / 240; let t = Math.min(dt, .1);
      while (t > 1e-6) { const s = Math.min(h, t); t -= s;
        d.copy(T).add(e).sub(it.p).multiplyScalar(w * w).addScaledVector(it.v, -2 * it.z * w); it.v.addScaledVector(d, s); it.p.addScaledVector(it.v, s); }
      d.copy(it.p).sub(T); const L = d.length(), M = it.max * Math.max(.3, this.gain);
      if (L > M) { d.multiplyScalar(M / L); it.p.copy(T).add(d); it.v.multiplyScalar(.5); }
      B.position.copy(P.worldToLocal(d.add(B.getWorldPosition(new THREE.Vector3())))); B.updateMatrixWorld(true);   // the bone moves by the same offset
    }
  }
  // offsets now, in cm (for tests and the panel)
  state() { return this.items.map(it => ({ bone: it.bone, cm: +(it.B.position.distanceTo(it.rest) * (it.B.parent.getWorldScale(new THREE.Vector3()).x) * 100).toFixed(2) })); }
}
