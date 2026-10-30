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
    this.b = body; this.on = true; this.gain = 1; this.prog = 4; this.wall = 12; const up = new THREE.Vector3(0, -1, 0);
    // the moving mass sits where the tissue is, not at the bone's root (for the breasts the root is at the spine):
    // the weighted centre of the skin the bone carries, kept in the bone's own frame, so a turn of the trunk moves it too
    const skin = body.skinMesh || body.layerMeshes.skin.find(m => m.isSkinnedMesh && m.name === "Body");   // skinMesh: any other runtime (avatar-runtime.js)
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
  // more soft tissue (bones added at run time: body.addSoftTissue): their items join the others
  add(spec) { const J = new Jiggle(this.b, spec); this.items.push(...J.items); return J.items.length; }
  get count() { return this.items.length; }
  reset() { for (const it of this.items) { it.p = null; it.Tp = null; } }
  // after the pose is applied and the world matrices are current
  // The tissue's size and firmness come from the body's shape sliders: a fuller breast (or glute) is a heavier mass on
  // the same ligaments, so it swings slower and further; firmer tissue faster, less far and sags less. Past a few
  // centimetres the ligaments and skin take over (stiffening progressively, not a hard stop), and the tissue can hardly
  // be pushed into the ribcage or the pelvis behind it (toward the bone's root it stops far sooner than outward).
  update(dt) {
    if (!this.items.length) return;
    const T = new THREE.Vector3(), e = new THREE.Vector3(), q = new THREE.Quaternion(), d = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0), nrm = new THREE.Vector3(), root = new THREE.Vector3();
    const S = this.b.shape || {};
    for (const it of this.items) {
      const B = it.B, P = B.parent;
      B.position.copy(it.rest); B.updateMatrixWorld(true); T.copy(it.off).applyMatrix4(B.matrixWorld);       // the tissue's centre in the pose
      if (!this.on) { it.p = null; continue; }
      const size = /^breast/.test(it.bone) ? (S.breast || 0) : /^glute/.test(it.bone) ? (S.glutes || 0) : /^thigh/.test(it.bone) ? (S.thighs || 0) * .7 + (S.weight || 0) * .5
        : /^belly/.test(it.bone) ? (S.belly || 0) * .6 + (S.weight || 0) * .6 : /^(arm|calf)[LR]$/.test(it.bone) ? (S.weight || 0) * .6 : 0, firm = (S.firmness || 0) * (/^breast/.test(it.bone) ? 1 : .3) + (S.muscle || 0) * (/^(thigh|belly)/.test(it.bone) ? .5 : 0);
      const f = it.f * (1 - .25 * Math.max(-1, size)) * (1 + .18 * firm), z = it.z * (1 + .15 * firm), M = it.max * (1 + .6 * Math.max(0, size)) * (1 - .2 * firm) * Math.max(.3, this.gain);
      // where gravity would settle it: the change of "down" in the parent's frame since the rest pose
      P.getWorldQuaternion(q); e.copy(it.gLocal).applyQuaternion(q).negate().add(down).multiplyScalar(it.sag * (1 + .5 * Math.max(0, size)) * (1 - .35 * firm) * this.gain);
      if (it.wind && this.b.wind) { const tt = this.b.t || 0, ph = it.bone.length;                       // cloth: blown by the wind (m per m/s), in gusts
        e.addScaledVector(this.b.wind, it.wind * (.75 + .25 * Math.sin(tt * 9.3 + ph) + .15 * Math.sin(tt * 23.1 + ph * 2))); }
      root.setFromMatrixPosition(B.matrixWorld); nrm.copy(T).sub(root).normalize();                       // outward, from the root to the tissue
      if (!it.p || !it.Tp || it.Tp.distanceTo(T) > .3) { it.p = T.clone().add(e); it.v.set(0, 0, 0); it.Tp = T.clone(); it.ep = e.clone(); }   // (and after a jump in place)
      // the tissue follows the body: the target moves through the frame from where it was to where it is, and the
      // damping acts on the tissue's motion relative to it (a body moving or turning steadily carries the tissue along;
      // only a change of motion, a take-off, a landing, a blow, makes it lag and swing)
      const w = 2 * Math.PI * f, h = 1 / 240, D = Math.min(dt, .1), vT = D > 1e-6 ? T.clone().sub(it.Tp).multiplyScalar(1 / D) : new THREE.Vector3(), Tt = new THREE.Vector3(), et = new THREE.Vector3(), rv = new THREE.Vector3();
      let t = 0;
      while (t < D - 1e-6) { const s = Math.min(h, D - t); t += s; const u = t / D;
        Tt.lerpVectors(it.Tp, T, u); et.lerpVectors(it.ep, e, u);
        d.copy(it.p).sub(Tt).sub(et); const L = d.length(), inw = -d.dot(nrm);
        const r = Math.min(L / M, 1.6), k = w * w * (1 + this.prog * r ** 4) + (inw > .25 * M ? w * w * this.wall * Math.min(2, (inw - .25 * M) / M) : 0);   // ligaments (stiffening past M); the chest wall
        rv.copy(it.v).sub(vT);
        d.multiplyScalar(-k).addScaledVector(rv, -2 * z * w * (1 + 2 * r * r)); it.v.addScaledVector(d, s); it.p.addScaledVector(it.v, s);
        d.copy(it.p).sub(Tt); const L2 = d.length(), M3 = M * 1.6;                     // the last stop (the outward motion relative to the body is taken out)
        if (L2 > M3) { d.multiplyScalar(M3 / L2); it.p.copy(Tt).add(d); d.normalize(); const vr = rv.copy(it.v).sub(vT).dot(d); if (vr > 0) it.v.addScaledVector(d, -vr * 1.2); } }
      it.Tp.copy(T); it.ep.copy(e);
      if (!Number.isFinite(it.p.x + it.p.y + it.p.z + it.v.x + it.v.y + it.v.z)) { it.p = T.clone().add(e); it.v.set(0, 0, 0); }   // (never let a bad step stick)
      d.copy(it.p).sub(T);
      B.position.copy(P.worldToLocal(d.add(B.getWorldPosition(new THREE.Vector3())))); B.updateMatrixWorld(true);   // the bone moves by the same offset
    }
  }
  // a blow (the ball, a landing): add a velocity (m/s, world) to the tissue of the bones whose names match
  kick(match, v) { for (const it of this.items) if (it.p && match.test(it.bone)) it.v.add(v); }
  // offsets now, in cm (for tests and the panel)
  state() { return this.items.map(it => ({ bone: it.bone, cm: +(it.B.position.distanceTo(it.rest) * (it.B.parent.getWorldScale(new THREE.Vector3()).x) * 100).toFixed(2) })); }
}
