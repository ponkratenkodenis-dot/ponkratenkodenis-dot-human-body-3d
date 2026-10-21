// Test-only: CPU skinning (linear blend and dual quaternion) and metrics of how the skin keeps its volume at joints.
import * as THREE from "three";
export function boneInfo(body) {
  const m = body.parts.get("Body"), sk = m.skeleton, g = m.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, use = new Map();
  for (let i = 0; i < si.count; i++) for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > .05) { const n = sk.bones[si.getComponent(i, k)].name; use.set(n, (use.get(n) || 0) + 1); } }
  return { verts: g.attributes.position.count, tris: g.index ? g.index.count / 3 : 0, bones: [...use.entries()].sort((a, b) => b[1] - a[1]).map(x => x.join(":")) };
}

// dual quaternion of a rigid 4x4 (uniform scale removed); returns [qr(x,y,z,w), qd(x,y,z,w), s]
function m2dq(e) {
  const s = Math.hypot(e[0], e[1], e[2]), m = new THREE.Matrix4().fromArray(e), q = new THREE.Quaternion();
  const r = new THREE.Matrix4().extractRotation(m); q.setFromRotationMatrix(r);
  const t = [e[12], e[13], e[14]], qr = [q.x, q.y, q.z, q.w];
  // qd = 0.5 * (t,0) * qr
  const qd = [.5 * (t[0] * qr[3] + t[1] * qr[2] - t[2] * qr[1]), .5 * (-t[0] * qr[2] + t[1] * qr[3] + t[2] * qr[0]), .5 * (t[0] * qr[1] - t[1] * qr[0] + t[2] * qr[3]), -.5 * (t[0] * qr[0] + t[1] * qr[1] + t[2] * qr[2])];
  return [qr, qd, s];
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export function skinDQ(mesh, i, out, cache) {
  const sk = mesh.skeleton, g = mesh.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const v = new THREE.Vector3().fromBufferAttribute(g.attributes.position, i).applyMatrix4(mesh.bindMatrix);
  const R = [0, 0, 0, 0], D = [0, 0, 0, 0]; let r0 = null, S = 0;
  for (let k = 0; k < 4; k++) {
    const w = sw.getComponent(i, k); if (!w) continue; const b = si.getComponent(i, k);
    let dq = cache.get(b); if (!dq) { dq = m2dq(sk.boneMatrices.subarray(b * 16, b * 16 + 16)); cache.set(b, dq); }
    let f = w; if (!r0) r0 = dq[0]; else if (r0[0] * dq[0][0] + r0[1] * dq[0][1] + r0[2] * dq[0][2] + r0[3] * dq[0][3] < 0) f = -w;
    for (let j = 0; j < 4; j++) { R[j] += f * dq[0][j]; D[j] += f * dq[1][j]; } S += w * dq[2];
  }
  const L = Math.hypot(...R); for (let j = 0; j < 4; j++) { R[j] /= L; D[j] /= L; }
  const qv = [R[0], R[1], R[2]], p = [v.x * S, v.y * S, v.z * S];
  const c1 = cross(qv, p), c2 = cross(qv, [c1[0] + R[3] * p[0], c1[1] + R[3] * p[1], c1[2] + R[3] * p[2]]);
  const t = cross(qv, [D[0], D[1], D[2]]);
  out.set(p[0] + 2 * c2[0] + 2 * (R[3] * D[0] - D[3] * R[0] + t[0]), p[1] + 2 * c2[1] + 2 * (R[3] * D[1] - D[3] * R[1] + t[1]), p[2] + 2 * c2[2] + 2 * (R[3] * D[2] - D[3] * R[2] + t[2]));
  return out.applyMatrix4(mesh.bindMatrixInverse);
}
function skinned(mesh, mode) {
  const n = mesh.geometry.attributes.position.count, P = new Float32Array(n * 3), v = new THREE.Vector3(), cache = new Map();
  for (let i = 0; i < n; i++) { if (mode === "dqs") skinDQ(mesh, i, v, cache); else mesh.getVertexPosition(i, v); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; }
  return P;
}
export const JOINTS = {
  kneeL: { bone: "lowerleg01L", r: .085, bones: ["Patella.l", "Femur.l", "Tibia.l"] },
  elbowL: { bone: "lowerarm01L", r: .065, bones: ["Humerus.l", "Ulna.l", "Radius.l"] },
  hipL: { bone: "upperleg01L", r: .11, bones: ["Femur.l", "Hip bone.l"] },
  shoulderL: { bone: "upperarm01L", r: .09, bones: ["Humerus.l", "Scapula.l", "Clavicle.l"] }
};
// cone volume of the skin patch around a joint, seen from the joint centre
function patchVol(P, idx, sel, c) {
  let V = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], d = idx[t + 2]; if (!sel[a] || !sel[b] || !sel[d]) continue;
    const ax = P[a * 3] - c.x, ay = P[a * 3 + 1] - c.y, az = P[a * 3 + 2] - c.z, bx = P[b * 3] - c.x, by = P[b * 3 + 1] - c.y, bz = P[b * 3 + 2] - c.z, dx = P[d * 3] - c.x, dy = P[d * 3 + 1] - c.y, dz = P[d * 3 + 2] - c.z;
    V += (ax * (by * dz - bz * dy) - ay * (bx * dz - bz * dx) + az * (bx * dy - by * dx)) / 6;
  }
  return V;
}
// state captured at the current pose
export function capture(body, mode) {
  const m = body.parts.get("Body"); body.root.updateMatrixWorld(true); m.skeleton.update();
  const P = skinned(m, mode), J = {}, inv = m.matrixWorld.clone().invert();
  for (const k in JOINTS) J[k] = body.bones[JOINTS[k].bone].getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  return { P, J };
}
export function measure(body, rest, posed, opts = {}) {
  const m = body.parts.get("Body"), idx = m.geometry.index.array, n = rest.P.length / 3, out = {};
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(posed.P, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), tmp = new THREE.Mesh(geo, mat); tmp.updateMatrixWorld(true); geo.computeBoundingSphere();
  const rc = new THREE.Raycaster(), dirs = [new THREE.Vector3(1, .013, .007).normalize(), new THREE.Vector3(-.011, 1, .017).normalize(), new THREE.Vector3(.019, -.007, -1).normalize()];
  const inside = p => { let votes = 0; for (const d of dirs) { rc.set(p, d); if (rc.intersectObject(tmp, false).length % 2) votes++; } return votes >= 2; };
  const inv = m.matrixWorld.clone().invert(), v = new THREE.Vector3();
  for (const k of opts.joints || Object.keys(JOINTS)) {
    const J = JOINTS[k], c0 = rest.J[k], c1 = posed.J[k], sel = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (Math.hypot(rest.P[i * 3] - c0.x, rest.P[i * 3 + 1] - c0.y, rest.P[i * 3 + 2] - c0.z) < J.r) sel[i] = 1;
    const vr = patchVol(rest.P, idx, sel, c0), vp = patchVol(posed.P, idx, sel, c1);
    // bone points near the joint that end up outside the skin
    let tot = 0, outn = 0, depth = 0; const per = {};
    for (const bn of J.bones) {
      const bm = body.parts.get(bn); if (!bm) continue; const bp = bm.geometry.attributes.position, step = Math.max(1, Math.floor(bp.count / 1500));
      for (let i = 0; i < bp.count; i += step) {
        bm.getVertexPosition(i, v); v.applyMatrix4(bm.matrixWorld).applyMatrix4(inv);
        if (v.distanceTo(c1) > J.r) continue; tot++;
        if (!inside(v)) { outn++; per[bn] = (per[bn] || 0) + 1; let dm = 1e9; for (let j = 0; j < n; j++) if (sel[j]) { const d = Math.hypot(posed.P[j * 3] - v.x, posed.P[j * 3 + 1] - v.y, posed.P[j * 3 + 2] - v.z); if (d < dm) dm = d; } depth = Math.max(depth, dm); }
      }
    }
    out[k] = { vol: +(vp / vr).toFixed(3), bonePts: tot, outside: outn, maxOut_mm: Math.round(depth * 1000), per };
  }
  geo.dispose(); return out;
}
// one call: rest (stand) vs a pose, both skinning modes
export async function compare(Body, pose, joints) {
  const b = Body.body; b.drive && (b.drive.enabled = false);
  Body.run({ op: "reset" }); Body.run({ op: "snap" });
  const rl = capture(b, "lbs"), rd = capture(b, "dqs");
  Body.run({ op: "set", ...pose }); Body.run({ op: "snap" });
  const pl = capture(b, "lbs"), pd = capture(b, "dqs");
  return { lbs: measure(b, rl, pl, { joints }), dqs: measure(b, rd, pd, { joints }) };
}
