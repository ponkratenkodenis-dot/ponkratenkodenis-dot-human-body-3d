// The body under gravity. A skeleton of points at the joints (pelvis, hips, knees, ankles, toes, belly, chest, neck,
// head, shoulders, elbows, wrists, hands), position-based dynamics (Müller et al. 2007), after the pose of the frame:
// - bones keep their length (each pair a fixed distance, the trunk braced across);
// - muscle tone: groups of points (the pelvis, the chest, the head; each joint with its neighbours) are pulled to the
//   shape they have in the animation, turned as the group lies now (shape matching): the joints hold the animated
//   angles as hard as `tone`, and the body as a whole turns and falls freely;
// - `follow` (0..1): how hard every point is pulled to where the animation has it. 1: the animation, exactly (the
//   physics only keeps the velocities, so that letting go carries the motion on). 0: free under gravity;
// - gravity, a little air drag, the ground (each point a ball of its radius, scaled with the body) with friction
//   (sand: 1.2, the share of sliding speed lost per 1/60 s); a body let go keeps at most vmax (6 m/s);
//   walls: [x min, x max] (world), the goal's posts, say.
// Then the bones are turned to the points: pelvis, chest and head by their groups' turn, each limb bone by the turn
// of its segment on top of its parent's; the whole body is moved by the pelvis' shift.
import * as THREE from "three";

// [name, bone, radius (m, at scale 1)]; "crown": the skull's middle, 10 cm up the head bone
const PTS = [
  ["pelvis", "root", .11], ["hipL", "upperleg01L", .085], ["hipR", "upperleg01R", .085], ["kneeL", "lowerleg01L", .055], ["kneeR", "lowerleg01R", .055],
  ["ankleL", "footL", .045], ["ankleR", "footR", .045], ["toeL", "toe3-1L", .03], ["toeR", "toe3-1R", .03],
  ["belly", "spine03", .11], ["chest", "spine01", .12], ["neck", "neck01", .055], ["head", "head", .07], ["crown", "head", .1],
  ["shL", "upperarm01L", .055], ["shR", "upperarm01R", .055], ["elbL", "lowerarm01L", .04], ["elbR", "lowerarm01R", .04],
  ["wrL", "wristL", .035], ["wrR", "wristR", .035], ["handL", "finger3-1L", .03], ["handR", "finger3-1R", .03],
];
const LR = a => a.flatMap(x => x.includes("$") ? [x.replace(/\$/g, "L"), x.replace(/\$/g, "R")] : [x]);
// bones: fixed lengths (the trunk braced across: it bends at the belly, not anywhere)
const RODS = LR(["pelvis hip$", "hipL hipR", "pelvis belly", "hip$ belly", "belly chest", "chest sh$", "shL shR", "belly sh$", "chest neck", "neck head", "head crown", "neck crown",
  "hip$ knee$", "knee$ ankle$", "ankle$ toe$", "sh$ elb$", "elb$ wr$", "wr$ hand$"]).map(s => s.split(" "));
// groups held to their animated shape: rigid (the pelvis, the chest, the head) and the joints (by `tone`)
const RIGID = [["pelvis", "hipL", "hipR", "belly"], ["belly", "chest", "shL", "shR", "neck"], ["chest", "neck", "head", "crown"]];
const JOINTS = [["pelvis", "belly", "chest"], ["chest", "neck", "crown"], ...LR(["pelvis hip$ knee$", "hip$ knee$ ankle$", "knee$ ankle$ toe$", "chest sh$ elb$", "sh$ elb$ wr$", "elb$ wr$ hand$"]).map(s => s.split(" "))];

// the turn that takes points a (centred) to points b (centred), from q (Müller et al. 2016, a few steps)
const _R = new THREE.Vector3(), _w = new THREE.Vector3(), _t = new THREE.Vector3(), _s = new THREE.Vector3(), _dq = new THREE.Quaternion(), _m = new THREE.Matrix4();
const wquat = (o, q) => { _m.extractRotation(o.matrixWorld); return q.setFromRotationMatrix(_m); };   // a world turn from the matrix as it is
function turn(a, b, q, steps = 6) {
  for (let s = 0; s < steps; s++) { _w.set(0, 0, 0); let d = 0;
    for (let i = 0; i < a.length; i++) { _R.copy(a[i]).applyQuaternion(q); _w.add(_t.crossVectors(_R, b[i])); d += _R.dot(b[i]); }
    const om = _w.multiplyScalar(1 / (Math.abs(d) + 1e-9)), w = om.length(); if (w < 1e-9) break;
    q.premultiply(_dq.setFromAxisAngle(om.multiplyScalar(1 / w), w)).normalize(); }
  return q;
}

export class Ragdoll {
  constructor(body, { ground = 0, walls = null, gravity = 9.81, tone = .35, friction = 1.2, drag = .4, vmax = 6, iters = 6, step = 1 / 120 } = {}) {
    this.body = body; this.ground = ground; this.walls = walls; this.vmax = vmax; this.gravity = gravity; this.tone = tone; this.friction = friction; this.drag = drag; this.iters = iters; this.step = step;
    this.follow = 1; this.pin = null; this.ok = true;                                     // pin: { point: 0..1 } held to the animation regardless (hands round a caught ball)
    const B = body.bones; this.miss = PTS.filter(([, b]) => !B[b]).map(([n]) => n); if (this.miss.length) { this.ok = false; return; }
    this.idx = Object.fromEntries(PTS.map(([n], i) => [n, i])); const ix = n => this.idx[n];
    this.n = PTS.length; this.rad = PTS.map(p => p[2]);
    const V = () => Array.from({ length: this.n }, () => new THREE.Vector3());
    this.X = V(); this.Vel = V(); this.A = V(); this.A0 = V(); this.P = V(); this.T = V();
    this.rods = RODS.map(([a, b]) => [ix(a), ix(b), 0]);
    this.groups = [...RIGID.map(g => ({ m: g.map(ix), rigid: true })), ...JOINTS.map(g => ({ m: g.map(ix), rigid: false }))].map(g => ({ ...g, q: new THREE.Quaternion(), a: g.m.map(() => new THREE.Vector3()), b: g.m.map(() => new THREE.Vector3()), ca: new THREE.Vector3(), cb: new THREE.Vector3() }));
    this.started = false; this.contact = 0; this.free = false;
    // the bones turned to the points, parents first: [bone, (segment from, to) or group, parent's turn]
    const g = n => this.groups.findIndex(x => x.rigid && x.m[0] === ix(n));
    this.drive = [["root", { group: g("pelvis") }], ["spine03", { mix: [g("pelvis"), g("belly"), .5] }], ["spine02", { group: g("belly") }], ["neck02", { mix: [g("belly"), g("chest"), .5] }], ["head", { group: g("chest") }]];
    for (const S of ["L", "R"]) this.drive.push(["upperleg01" + S, { seg: ["hip" + S, "knee" + S] }], ["lowerleg01" + S, { seg: ["knee" + S, "ankle" + S] }], ["foot" + S, { seg: ["ankle" + S, "toe" + S] }],
      ["upperarm01" + S, { seg: ["sh" + S, "elb" + S] }], ["lowerarm01" + S, { seg: ["elb" + S, "wr" + S] }], ["wrist" + S, { seg: ["wr" + S, "hand" + S] }]);
    this.drive = this.drive.filter(([b]) => B[b]).map(([b, d]) => ({ bone: B[b], ...d, seg: d.seg && d.seg.map(ix), wq: new THREE.Quaternion(), D: new THREE.Quaternion() }));
  }
  // the animated points now (world)
  // (from the bones' world matrices as they are: body.frame() updates them just before)
  _read(out) {
    const B = this.body.bones, up = new THREE.Vector3(), s = _s.setFromMatrixScale(this.body.root.matrixWorld).x;
    PTS.forEach(([n, b], i) => { out[i].setFromMatrixPosition(B[b].matrixWorld); if (n === "crown") out[i].add(up.set(0, .1, 0).transformDirection(B[b].matrixWorld).multiplyScalar(.1 * s)); });
    return s;
  }
  reset() { this.started = false; }
  // a blow: a velocity change (m/s, world) at a point and, half as much, its neighbours by the bones; the body takes
  // it only as far as follow lets go (a page lowers follow for a moment to let it show)
  push(name, v) { const i = this.idx[name]; if (i == null || !this.started) return false; this.Vel[i].add(v);
    for (const [a, b] of this.rods) { if (a === i) this.Vel[b].addScaledVector(v, .5); else if (b === i) this.Vel[a].addScaledVector(v, .5); } return true; }
  update(dt) {
    if (!this.ok || !(dt > 0)) return;
    const n = this.n, X = this.X, Vl = this.Vel, A = this.A, A0 = this.A0;
    for (let i = 0; i < n; i++) A0[i].copy(A[i]); const sc = this._read(A);
    if (!this.started) { this.started = true; for (let i = 0; i < n; i++) { X[i].copy(A[i]); Vl[i].set(0, 0, 0); } return; }
    // the animation, exactly: the points are the animated ones; their velocity is kept for letting go
    let gap = 0; if (this.free) for (let i = 0; i < n; i++) gap = Math.max(gap, X[i].distanceToSquared(A[i]));
    if (this.follow >= .999 && gap < 2.5e-5) {                                               // (once within 5 mm of it: no pop)
      // (smoothed over ~3 frames and capped: the rig's jumps between its modes are not a body's speed)
      for (let i = 0; i < n; i++) { _t.subVectors(A[i], X[i]).multiplyScalar(1 / dt); Vl[i].lerp(_t, .5); if (Vl[i].length() > this.vmax) Vl[i].setLength(this.vmax); X[i].copy(A[i]); } this.free = false; return; }
    this.free = true;
    for (const r of this.rods) r[2] = A[r[0]].distanceTo(A[r[1]]);                         // lengths as animated (the body's own shape)
    for (const g of this.groups) { g.ca.set(0, 0, 0); for (const i of g.m) g.ca.add(A[i]); g.ca.multiplyScalar(1 / g.m.length); g.m.forEach((i, k) => g.a[k].subVectors(A[i], g.ca)); }
    this._pin = this.pin ? Object.entries(this.pin).filter(([k]) => this.idx[k] != null).map(([k, v]) => [this.idx[k], v]) : null;
    const steps = Math.max(1, Math.min(8, Math.ceil(dt / this.step))), h = dt / steps, P = this.P, T = this.T, it = this.iters;
    const W = this.walls, kf = 1 - Math.pow(1 - Math.min(.999, this.follow), h * 60), kt = 1 - Math.pow(1 - Math.min(.999, this.tone), 1 / it), gy = -this.gravity * h, drag = Math.exp(-this.drag * h);
    this.contact = 0;
    for (let s = 0; s < steps; s++) {
      const u = (s + 1) / steps; for (let i = 0; i < n; i++) T[i].lerpVectors(A0[i], A[i], u);  // the animation within the frame
      for (let i = 0; i < n; i++) { Vl[i].multiplyScalar(drag); Vl[i].y += gy; P[i].copy(X[i]).addScaledVector(Vl[i], h); }
      for (let k = 0; k < it; k++) {
        for (const [a, b, L] of this.rods) { const pa = P[a], pb = P[b]; _t.subVectors(pb, pa); const d = _t.length(); if (d < 1e-9) continue; const c = (d - L) / d * .5; pa.addScaledVector(_t, c); pb.addScaledVector(_t, -c); }
        for (const g of this.groups) { const st = g.rigid ? 1 : kt; if (!st) continue;
          g.cb.set(0, 0, 0); for (const i of g.m) g.cb.add(P[i]); g.cb.multiplyScalar(1 / g.m.length); g.m.forEach((i, j) => g.b[j].subVectors(P[i], g.cb));
          turn(g.a, g.b, g.q, 2); g.m.forEach((i, j) => { _t.copy(g.a[j]).applyQuaternion(g.q).add(g.cb); P[i].lerp(_t, st); }); }
        for (let i = 0; i < n; i++) { const r = this.rad[i] * sc, lo = this.ground + r; if (P[i].y < lo) P[i].y = lo;
          if (W) { if (P[i].x < W[0] + r) P[i].x = W[0] + r; else if (P[i].x > W[1] - r) P[i].x = W[1] - r; } }
      }
      for (let i = 0; i < n; i++) { Vl[i].subVectors(P[i], X[i]).multiplyScalar(1 / h);
        if (P[i].y <= this.ground + this.rad[i] * sc + 1e-4) { this.contact++; if (Vl[i].y < 0) Vl[i].y = 0; const f = Math.max(0, 1 - this.friction * 60 * h); Vl[i].x *= f; Vl[i].z *= f; }   // on the sand: it holds
        X[i].copy(P[i]); }
      // toward the animation: places and velocities both (a pull adds no momentum of its own: no fling on the way back)
      const fol = (i, k) => { X[i].lerp(T[i], k); Vl[i].lerp(_t.subVectors(A[i], A0[i]).multiplyScalar(1 / dt), k); };
      if (kf > 0) for (let i = 0; i < n; i++) fol(i, kf);
      if (this._pin) for (const [i, k] of this._pin) fol(i, k);
    }
    this._write();
  }
  // the bones to the points. The world turns are read from the matrices as animated (none is updated here): a bone's
  // parent is turned as the nearest driven bone above it is, its own turn is set in its parent's frame
  _write() {
    const X = this.X, A = this.A, q = new THREE.Quaternion(), pq = new THREE.Quaternion(), a = new THREE.Vector3(), b = new THREE.Vector3(), I = new THREE.Quaternion();
    for (const g of this.groups) if (g.rigid) { g.cb.set(0, 0, 0); for (const i of g.m) g.cb.add(X[i]); g.cb.multiplyScalar(1 / g.m.length); g.m.forEach((i, j) => g.b[j].subVectors(X[i], g.cb)); turn(g.a, g.b, g.q, 8); }
    const D = new Map();
    for (const d of this.drive) {
      let par = d.bone.parent; while (par && !D.has(par)) par = par.parent; const P = par ? D.get(par) : I;
      if (d.group != null) d.D.copy(this.groups[d.group].q);
      else if (d.mix) d.D.slerpQuaternions(this.groups[d.mix[0]].q, this.groups[d.mix[1]].q, d.mix[2]);
      else { a.subVectors(A[d.seg[1]], A[d.seg[0]]).applyQuaternion(P).normalize(); b.subVectors(X[d.seg[1]], X[d.seg[0]]).normalize(); d.D.setFromUnitVectors(a, b).multiply(P); }
      D.set(d.bone, d.D);
      q.copy(d.D).multiply(wquat(d.bone, d.wq)); wquat(d.bone.parent, pq).premultiply(P); d.bone.quaternion.copy(pq.invert().multiply(q));
    }
    // the whole body moved by the pelvis' shift (the next stage updates the matrices)
    const R = this.body.root, sh = X[0].clone().sub(A[0]); if (R.parent) sh.applyQuaternion(wquat(R.parent, q).invert());
    R.position.add(sh); R.updateMatrix();
  }
  state() { let lo = Infinity, v = 0; for (let i = 0; i < this.n; i++) { lo = Math.min(lo, this.X[i].y); v = Math.max(v, this.Vel[i].length()); } return { free: this.free, follow: this.follow, contact: this.contact, lowest: +lo.toFixed(3), speed: +v.toFixed(2) }; }
}
