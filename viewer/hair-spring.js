// Things that hang and swing on spring chains: the part of a hairstyle that hangs free of the head (a ponytail, a braid,
// long ends), the ends of a tied shirt, a strap. Each gets a few bones of its own, laid along it at run time, and swings
// as a chain of point masses: gravity, the body's own motion (it lags behind a turn or a dive and whips after it), wind,
// a little stiffness toward its rest shape, air drag, a limit on how sharply it can bend, and collisions with spheres on
// the body (the skull, the upper back, the belly) so it falls over them and never through.
//   const hs = hairSpring(body, hairMesh); body.springs.push(hs)   (body.js runs every spring after the pose)
//   body.wind = new THREE.Vector3(...)  m/s, world: blows every chain
import * as THREE from "three";

export const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// A chain under one bone of a skinned mesh.
//   joints: points at bind time (the mesh's bind frame: y up, z to the front), root first
//   weight(i, p, s): how much vertex i (bind position p, arc parameter s along the chain, 0 at the root .. segments at
//     the tip) follows the chain instead of its own weights (0 .. 1)
//   colliders: [{ bone (name), c (bind point), r }]
//   stiff: per joint (1..n), the pull toward the rest shape per 1/120 s
export class ChainSpring {
  constructor(body, mesh, { parent, joints, weight, colliders = [], stiff = [], drag = .975, bend = 55, gravity = 9.81, air = .06, name = "chain" }) {
    this.b = body; this.mesh = mesh; this.on = true; this.ok = false; this.drag = drag; this.g = gravity; this.air = air; this.bend = Math.cos(bend * Math.PI / 180); this.bend0 = Math.cos(Math.min(170, bend * 1.6) * Math.PI / 180);
    const sk = mesh.skeleton, names = sk.bones.map(b => b.name), pi = names.indexOf(parent); if (pi < 0 || joints.length < 2) return;
    const pb = body.bones[parent] || sk.bones[pi], pInv = sk.boneInverses[pi], segments = joints.length - 1;
    const hl = joints.map(p => p.clone().applyMatrix4(pInv));             // the joints in the parent bone's own frame
    const bones = [], inv = []; let par = pb;
    for (let k = 0; k < segments; k++) {
      const B = new THREE.Bone(); B.name = name + k; B.position.copy(k ? hl[k].clone().sub(hl[k - 1]) : hl[0]); par.add(B); par = B; bones.push(B);
      inv.push(new THREE.Matrix4().makeTranslation(-hl[k].x, -hl[k].y, -hl[k].z).multiply(pInv));
    }
    // weights: along the chain by the arc parameter, blended into the vertex's own by weight()
    const g = mesh.geometry, P = g.attributes.position, n = P.count, v = new THREE.Vector3(), si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const NI = new Uint16Array(n * 4), NW = new Float32Array(n * 4), base = sk.bones.length, seg = joints.slice(1).map((p, k) => [joints[k], p]);
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const p = v.fromBufferAttribute(P, i).applyMatrix4(mesh.bindMatrix).clone(); let best = 1e9, s = 0;
      seg.forEach(([a, b], k) => { const ab = b.clone().sub(a), t = Math.min(1, Math.max(0, p.clone().sub(a).dot(ab) / ab.lengthSq())), d = p.distanceTo(a.clone().addScaledVector(ab, t)); if (d < best) { best = d; s = k + t; } });
      const a = Math.max(0, Math.min(1, weight(i, p, s))), k = Math.min(segments - 1, Math.floor(s)), f = s - k, W = new Map();
      for (let j = 0; j < 4; j++) { const w = sw.getComponent(i, j) * (1 - a); if (w > 0) W.set(si.getComponent(i, j), (W.get(si.getComponent(i, j)) || 0) + w); }
      if (a > 0) { moved++; const kb = base + k, kn = base + Math.min(segments - 1, k + 1), f2 = k + 1 < segments ? f : 0; W.set(kb, (W.get(kb) || 0) + a * (1 - f2)); if (f2) W.set(kn, (W.get(kn) || 0) + a * f2); }
      const best4 = [...W.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4), tot = best4.reduce((x, e) => x + e[1], 0) || 1;
      for (let j = 0; j < 4; j++) { NI[i * 4 + j] = best4[j] ? best4[j][0] : 0; NW[i * 4 + j] = best4[j] ? best4[j][1] / tot : 0; }
    }
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(NI, 4)); g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(NW, 4));
    mesh.bind(new THREE.Skeleton([...sk.bones, ...bones], [...sk.boneInverses, ...inv]), mesh.bindMatrix);
    this.colliders = colliders.map(o => { const ci = names.indexOf(o.bone); return ci < 0 ? null : { bone: body.bones[o.bone] || sk.bones[ci], c: o.c.clone().applyMatrix4(sk.boneInverses[ci]), r: o.r }; }).filter(Boolean);
    this.parent = pb; this.bones = bones; this.hl = hl; this.n = segments; this.stiff = Array.from({ length: segments + 1 }, (_, k) => stiff[k] != null ? stiff[k] : .01);
    this.x = null; this.xp = null; this.ok = true; this.moved = moved;
  }
  reset() { this.x = null; }
  // a blow: add a velocity (m/s, world) to the chain, more toward its free end
  kick(v) { if (!this.x) return; for (let k = 1; k <= this.n; k++) this.xp[k].addScaledVector(v, -(k / this.n) / 120); }
  update(dt) {
    if (!this.ok) return; const n = this.n, H = this.parent, M = H.matrixWorld;
    for (const B of this.bones) B.quaternion.identity();
    H.updateWorldMatrix(true, false);
    const r = this.hl.map(p => p.clone().applyMatrix4(M));            // the rest shape, carried by the parent bone
    if (!this.on || !this.x) { this.x = r.map(p => p.clone()); this.xp = r.map(p => p.clone()); if (!this.on) return; }
    const L = r.slice(1).map((p, k) => p.distanceTo(r[k]));
    const sc = this.b.root ? this.b.root.scale.x : 1, C = this.colliders.map(o => ({ c: o.c.clone().applyMatrix4(o.bone.matrixWorld), r: o.r * sc }));
    const wind = this.b.wind || null;
    let t = Math.min(dt, .1); const h = 1 / 120, gv = new THREE.Vector3(0, -this.g, 0), tmp = new THREE.Vector3(), vel = new THREE.Vector3();
    while (t > 1e-6) {
      const s = Math.min(h, t); t -= s;
      this.x[0].copy(r[0]); this.xp[0].copy(r[0]);
      for (let k = 1; k <= n; k++) {
        const x = this.x[k], xp = this.xp[k]; vel.copy(x).sub(xp).multiplyScalar(this.drag); xp.copy(x);
        if (wind) vel.lerp(tmp.copy(wind).multiplyScalar(s), this.air);           // the air carries it toward the wind's speed
        x.add(vel).addScaledVector(gv, s * s);
        tmp.copy(r[k]).sub(x).multiplyScalar(this.stiff[k]); x.add(tmp); xp.add(tmp);     // the pull toward the rest shape moves it without making it swing (no ringing)
      }
      for (let it = 0; it < 6; it++) {
        for (let k = 1; k <= n; k++) {                                       // lengths
          const a = this.x[k - 1], b = this.x[k]; tmp.copy(b).sub(a); const d = tmp.length() || 1e-6, e = (d - L[k - 1]) / d;
          if (k === 1) b.addScaledVector(tmp, -e); else { a.addScaledVector(tmp, e * .5); b.addScaledVector(tmp, -e * .5); }
        }
        this.x[0].copy(r[0]);
        // it bends, but not into a kink: each segment within the bend limit of the one before (the first: of its rest
        // direction at the root)
        for (let k = 1; k <= n; k++) {
          const pd = k === 1 ? tmp.copy(r[1]).sub(r[0]).normalize() : tmp.copy(this.x[k - 1]).sub(this.x[k - 2]).normalize();
          const cd = this.x[k].clone().sub(this.x[k - 1]), l = cd.length() || 1e-6; cd.multiplyScalar(1 / l); const c = cd.dot(pd);
          const lim = k === 1 ? this.bend0 : this.bend;
          if (c < lim) {
            const perp = cd.clone().addScaledVector(pd, -c); if (perp.lengthSq() < 1e-10) perp.set(1, 0, 0).cross(pd); perp.normalize();
            const sb = Math.sqrt(1 - lim * lim); this.x[k].copy(this.x[k - 1]).addScaledVector(pd, l * lim).addScaledVector(perp, l * sb);
          }
        }
        for (let k = 1; k <= n; k++) if (this.x[k].y < .01) this.x[k].y = .01;   // the ground
        for (let k = 1; k <= n; k++) for (const o of C) {                    // the body
          tmp.copy(this.x[k]).sub(o.c); const d = tmp.length(); if (d < o.r) this.x[k].copy(o.c).addScaledVector(tmp, o.r / (d || 1e-6));
        }
      }
    }
    // the chain's bones turned onto the simulated points
    const qp = H.getWorldQuaternion(new THREE.Quaternion()), d0 = new THREE.Vector3(), d1 = new THREE.Vector3(), q = new THREE.Quaternion(), qw = new THREE.Quaternion();
    for (let k = 0; k < n; k++) {
      d0.copy(r[k + 1]).sub(r[k]).normalize(); d1.copy(this.x[k + 1]).sub(this.x[k]).normalize();
      qw.setFromUnitVectors(d0, d1).multiply(H.getWorldQuaternion(q));
      const B = this.bones[k]; B.quaternion.copy(qp.clone().invert().multiply(qw)); qp.copy(qw);
      B.updateMatrixWorld(true);
    }
  }
}

const bindOf = (mesh, name) => { const i = mesh.skeleton.bones.findIndex(b => b.name === name); return i < 0 ? null : mesh.skeleton.boneInverses[i].clone().invert(); };
const bindPoints = mesh => { const P = mesh.geometry.attributes.position, v = new THREE.Vector3(), X = []; for (let i = 0; i < P.count; i++) X.push(v.fromBufferAttribute(P, i).applyMatrix4(mesh.bindMatrix).clone()); return X; };
const centroid = (X, idx) => { const s = new THREE.Vector3(); for (const i of idx) s.add(X[i]); return s.multiplyScalar(1 / Math.max(1, idx.length)); };

// Hair: what hangs free of the skull (behind or below it) becomes a chain from the tie to the tip.
// raise (degrees): a high ponytail from a low one. What hangs free turns about the skull's centre (its root slides up the
// back of the head, the hair gathered toward it follows by its weight), then hangs from there under gravity
export function hairSpring(body, mesh, { segments = 4, skull = .098, raise = 0 } = {}) {
  const HB = bindOf(mesh, "head"); if (!HB) return { ok: false };
  const X = bindPoints(mesh), hp = new THREE.Vector3().setFromMatrixPosition(HB), R = skull, c = hp.clone().add(new THREE.Vector3(0, .085, .005));   // the skull, roughly
  const dist = X.map(p => p.distanceTo(c)), free = [];
  X.forEach((p, i) => { if (dist[i] > R + .03 && (p.z < c.z - .02 || p.y < c.y - .06)) free.push(i); });
  if (free.length < 30) { console.info("hair spring: nothing hangs free"); return { ok: false }; }
  if (raise) {
    const g = mesh.geometry;
    for (const nm of ["position", "normal"]) { const a = g.attributes[nm]; if (a && (a.normalized || !(a.array instanceof Float32Array) || a.isInterleavedBufferAttribute)) {   // quantized (KHR_mesh_quantization): moved points would clamp
      const f = new Float32Array(a.count * 3); for (let i = 0; i < a.count; i++) { f[i * 3] = a.getX(i); f[i * 3 + 1] = a.getY(i); f[i * 3 + 2] = a.getZ(i); } g.setAttribute(nm, new THREE.BufferAttribute(f, 3)); } }
    const th = raise * Math.PI / 180, P = g.attributes.position, N = g.attributes.normal, inv = mesh.bindMatrix.clone().invert(), v = new THREE.Vector3(), n = new THREE.Vector3();
    const NB = new THREE.Matrix3().getNormalMatrix(mesh.bindMatrix), NI = new THREE.Matrix3().getNormalMatrix(inv);
    X.forEach((p, i) => { const w = sstep(R, R + .05, dist[i]) * Math.max(sstep(c.z + .03, c.z - .04, p.z), sstep(c.y, c.y - .09, p.y)); if (w <= 0) return;
      const a = th * w, cs = Math.cos(a), sn = Math.sin(a), y = p.y - c.y, z = p.z - c.z; p.set(p.x, c.y + y * cs - z * sn, c.z + y * sn + z * cs);
      v.copy(p).applyMatrix4(inv); P.setXYZ(i, v.x, v.y, v.z);
      if (N) { n.fromBufferAttribute(N, i).applyMatrix3(NB); const ny = n.y * cs - n.z * sn, nz = n.y * sn + n.z * cs; n.set(n.x, ny, nz).applyMatrix3(NI).normalize(); N.setXYZ(i, n.x, n.y, n.z); } });
    P.needsUpdate = true; if (N) N.needsUpdate = true; g.computeBoundingSphere();
  }
  free.sort((a, b) => dist[a] - dist[b]); const m = Math.max(8, free.length * .06 | 0);
  const root = centroid(X, free.slice(0, m)), tip = centroid(X, free.slice(-m)), axis = tip.clone().sub(root), len = axis.length(); axis.normalize();
  const J = [root];
  for (let k = 1; k < segments; k++) { const lo = (k - .5) / segments * len, hi = (k + .5) / segments * len, sel = free.filter(i => { const t = X[i].clone().sub(root).dot(axis); return t > lo && t <= hi; });
    J.push(sel.length ? centroid(X, sel) : root.clone().addScaledVector(axis, k / segments * len)); }
  J.push(tip);
  const sp = bindOf(mesh, "spine01"), sp0 = sp ? new THREE.Vector3().setFromMatrixPosition(sp) : null;
  const S = new ChainSpring(body, mesh, { parent: "head", joints: J, name: "hair", stiff: [0, .08, .02, .01, .01, .01],
    weight: (i, p, s) => sstep(.2, .6, s) * sstep(R + .02, R + .05, dist[i]) * Math.max(sstep(c.z + .01, c.z - .04, p.z), sstep(c.y - .03, c.y - .09, p.y)),   // (the hair on the scalp stays on the head)
    colliders: [{ bone: "head", c, r: R + .012 }, ...(sp0 ? [{ bone: "spine01", c: sp0.clone().add(new THREE.Vector3(0, .05, -.02)), r: .1 }, { bone: "spine01", c: sp0.clone().add(new THREE.Vector3(0, .15, -.02)), r: .07 }] : [])] });
  if (S.ok) console.info("hair spring:", free.length, "points hang free,", segments, "segments, length", len.toFixed(3));
  return S;
}

// Anything that hangs from one spot (the ends of a knot, a tassel): the vertices below `below` metres under its top
// become a chain from there to their lowest point; `bone`: what it hangs from; `body`: a sphere it stays in front of
export function dangleSpring(body, mesh, { segments = 2, below = .012, bone, front = null, name = "dangle" } = {}) {
  const X = bindPoints(mesh); if (!X.length) return { ok: false };
  const top = Math.max(...X.map(p => p.y)), bot = Math.min(...X.map(p => p.y)), cut = top - (top - bot) * .45;
  const hang = X.map((p, i) => i).filter(i => X[i].y < cut); if (hang.length < 8) return { ok: false };
  const root = centroid(X, X.map((p, i) => i).filter(i => Math.abs(X[i].y - cut) < (top - bot) * .12)), lowest = hang.slice().sort((a, b) => X[a].y - X[b].y);
  const tip = centroid(X, lowest.slice(0, Math.max(4, lowest.length * .1 | 0)));
  const J = [root]; for (let k = 1; k <= segments; k++) J.push(root.clone().lerp(tip, k / segments));
  const nm = bone || (() => { const sw = mesh.geometry.attributes.skinWeight, si = mesh.geometry.attributes.skinIndex; let bi = 0, bw = -1; for (let j = 0; j < 4; j++) if (sw.getComponent(0, j) > bw) { bw = sw.getComponent(0, j); bi = si.getComponent(0, j); } return mesh.skeleton.bones[bi].name; })();
  const S = new ChainSpring(body, mesh, { parent: nm, joints: J, name, stiff: [0, .02, .01], drag: .97, bend: 70, air: .12,
    weight: (i, p) => sstep(cut + (top - bot) * .05, cut - (top - bot) * .1, p.y),
    colliders: front ? [{ bone: nm, c: root.clone().add(front.offset), r: front.r }] : [] });
  return S;
}
