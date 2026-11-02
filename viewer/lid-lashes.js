// Lashes that go with the eyelids. The model's own shapes move the lashes' roots with the lid (up to 1 cm on a blink)
// but their tips hardly at all (0.5-1 mm), so a closing eye drew each lash out into a long black bar over the lid.
// Here the lashes follow the lids' edges instead: each frame the edge's points, with the face's shapes on them
// (a blink, a squint, wide eyes, a look down; anything, a performance from video too), are taken, and every point
// of a lash turns with its stretch of edge about the eye's centre, the way a lid turns over the eyeball: a closed
// eye's lashes hang down and forward from the shut lid. And the lids shut all the way (lidClose).
//
// The lids' edges are taken where the lashes grow: the skin's points next to the lashes' roots. Each point of a lash
// takes the two nearest of them.
import * as THREE from "three";

const FACE = /^(eye|jaw|mouth|brow|cheek|nose|tongue)[A-Z]/;

// a point of a mesh with the shapes' weights on it (bind space); only: the shapes to take (null: all)
function shaped(mesh, i, out, only = null) {
  const g = mesh.geometry, P = g.attributes.position, MA = g.morphAttributes.position || [], I = mesh.morphTargetInfluences || [], rel = g.morphTargetsRelative;
  out.fromBufferAttribute(P, i); const x = out.x, y = out.y, z = out.z;
  for (let k = 0; k < I.length; k++) { const f = I[k], a = MA[k]; if (!f || !a || (only && !only[k])) continue;
    if (rel) { out.x += a.getX(i) * f; out.y += a.getY(i) * f; out.z += a.getZ(i) * f; } else { out.x += (a.getX(i) - x) * f; out.y += (a.getY(i) - y) * f; out.z += (a.getZ(i) - z) * f; } }
  return out.applyMatrix4(mesh.bindMatrix);
}

// the lids' edges, where the lashes grow: the points of the skin within 1.2 mm of a lash (the lashes' roots are set in
// the edge), per eye { c (centre), pts: [skin point] }
export function lidEdges(skin, lash, eyes, { reach = .0012 } = {}) {
  const g = skin.geometry, P = g.attributes.position, n = P.count, LP = lash.geometry.attributes.position, v = new THREE.Vector3(), L = [];
  for (let i = 0; i < LP.count; i++) L.push(v.fromBufferAttribute(LP, i).applyMatrix4(lash.bindMatrix).clone());
  const out = eyes.map(c => ({ c, pts: [] }));
  for (let i = 0; i < n; i++) { v.fromBufferAttribute(P, i).applyMatrix4(skin.bindMatrix); const e = eyes.findIndex(c => v.distanceTo(c) < .03); if (e < 0) continue;
    for (const l of L) if (l.distanceToSquared(v) < reach * reach) { out[e].pts.push(i); break; } }
  return out.every(o => o.pts.length > 6) ? out : null;
}

// the lids shut. The model's blink stops the upper lid's edge short of the lower one (up to 1.2 mm, most at the inner
// corner: the eye's white showed there), so a shape per eye is added to the skin: the blink's own movement, more by
// as much as the edge falls short there (along the lid, a table across x, 1 mm a step, smoothed; at most maxGain of
// the blink again), to meet the lower edge and press 0.2 mm past it. It is weighted with the blink each frame. Returns [[blink index, its shape's index]]
export function lidClose(skin, pts, eyes, { press = .0002, maxGain = .3 } = {}) {
  const g = skin.geometry, P = g.attributes.position, D = skin.morphTargetDictionary, MA = g.morphAttributes.position, MN = g.morphAttributes.normal, n = P.count, I = skin.morphTargetInfluences;
  if (!g.morphTargetsRelative || !MA) return [];
  const B = skin.bindMatrix, v = new THREE.Vector3(), pos = (M, i, f) => v.set(P.getX(i) + M.getX(i) * f, P.getY(i) + M.getY(i) * f, P.getZ(i) + M.getZ(i) * f).applyMatrix4(B).clone();
  const out = [];
  eyes.forEach((c, e) => { const name = c.x > 0 ? "eyeBlinkLeft" : "eyeBlinkRight", k = D[name]; if (k == null || D["lidClose" + name.slice(8)] != null) return;
    const M = MA[k], mv = i => Math.hypot(M.getX(i), M.getY(i), M.getZ(i)), E = pts.filter(p => p.e === e), up = E.filter(p => mv(p.i) > .002 && p.a.y > c.y + .001), lo = E.filter(p => p.a.y < c.y - .001);   // (by height at rest: a lid's corner moves little)
    if (!up.length || !lo.length) return;
    // along the lid, 1 mm steps: the upper edge's lowest point when shut (the skin above it moves less), against the
    // lower edge's top there (the lower lashes' roots reach a little down the lid)
    const UB = up.map(p => [pos(M, p.i, 0).x, pos(M, p.i, 1), p.i]), LB = lo.map(q => pos(M, q.i, 1)), S = [];
    for (const [x] of UB) { let a = null, ai = -1; for (const [x2, b, i] of UB) if (Math.abs(x2 - x) < .001 && (!a || b.y < a.y)) { a = b; ai = i; }
      let y = -Infinity; for (const b of LB) if (Math.abs(b.x - a.x) < .0015 && b.y > y) y = b.y; if (!isFinite(y)) continue;
      S.push([x, Math.min(maxGain, Math.max(0, a.y - y + press) / Math.max(1e-4, -M.getY(ai)))]); }
    const x0 = Math.min(...S.map(s => s[0])) - .004, x1 = Math.max(...S.map(s => s[0])) + .004, nb = Math.ceil((x1 - x0) / .001) + 1;
    let T = new Float32Array(nb); for (const [x, f] of S) for (let b = 0; b < nb; b++) if (Math.abs(x0 + b * .001 - x) < .0015) T[b] = Math.max(T[b], f);
    for (let r = 0; r < 3; r++) { const T2 = new Float32Array(nb); for (let b = 0; b < nb; b++) T2[b] = .25 * (T[b - 1] || 0) + .5 * T[b] + .25 * (T[b + 1] || 0); T = T2; }
    const at = x => { const u = (x - x0) / .001, b = Math.floor(u), f = u - b; return b < 0 || b >= nb - 1 ? 0 : T[b] * (1 - f) + T[b + 1] * f; };
    const A = new Float32Array(n * 3), AN = MN && MN[k] ? new Float32Array(n * 3) : null; let moved = 0;
    for (let i = 0; i < n; i++) { const m = mv(i); if (m < 1e-5) continue; const p = pos(M, i, 0); if (p.distanceTo(c) > .03) continue; const f = at(p.x); if (!f) continue;
      A[i * 3] = M.getX(i) * f; A[i * 3 + 1] = M.getY(i) * f; A[i * 3 + 2] = M.getZ(i) * f; moved++;
      if (AN) { AN[i * 3] = MN[k].getX(i) * f; AN[i * 3 + 1] = MN[k].getY(i) * f; AN[i * 3 + 2] = MN[k].getZ(i) * f; } }
    MA.push(new THREE.BufferAttribute(A, 3)); if (MN) MN.push(new THREE.BufferAttribute(AN || new Float32Array(n * 3), 3));
    const j = MA.length - 1; D["lidClose" + name.slice(8)] = j; I[j] = 0; out.push([k, j, moved, +Math.max(...T).toFixed(3)]); });
  return out;
}

// body: a HumanBody with an ARKit face and an "Eyelashes" mesh; opt spec (the lashes' specular), env (their
// reflections), crisp ([lo, hi] of the texture's cover kept, or null). Returns { ok, update(), stats } (or { ok: false, error })
export function lidLashes(body, { spec = .25, env = .4, crisp = [.25, .65] } = {}) {
  const skin = body.parts.get("Body"), lash = body.parts.get("Eyelashes"); if (!skin || !lash) return { ok: false, error: "no skin or lashes" };
  const sk = skin.skeleton, at = b => { const i = b && sk ? sk.bones.indexOf(b) : -1; return i < 0 ? null : new THREE.Vector3().setFromMatrixPosition(sk.boneInverses[i].clone().invert()); };
  const eL = at(body.bones.eyeL), eR = at(body.bones.eyeR); if (!eL || !eR) return { ok: false, error: "no eye bones" };
  const L = lidEdges(skin, lash, [eL, eR]); if (!L) return { ok: false, error: "no lid edges" };
  // the edges at rest: the skin as shaped (the body's own shape keys), without the face's
  const Dk = skin.morphTargetDictionary || {}, shapeOnly = []; for (const [k, i] of Object.entries(Dk)) shapeOnly[i] = !FACE.test(k) && !/^lid/.test(k);
  const v = new THREE.Vector3(), pts = []; for (const [e, o] of L.entries()) for (const i of o.pts) pts.push({ i, e, a: shaped(skin, i, new THREE.Vector3(), shapeOnly).clone(), b: new THREE.Vector3() });
  const shut = lidClose(skin, pts, [eL, eR]);
  // each point of a lash: its eye, and the edge's two nearest points
  const g = lash.geometry, P = g.attributes.position, n = P.count, B = lash.bindMatrix, BI = B.clone().invert();
  const NA = g.attributes.normal, NB = new THREE.Matrix3().getNormalMatrix(B), NBI = new THREE.Matrix3().getNormalMatrix(BI), nv = new THREE.Vector3();
  const R = []; for (let i = 0; i < n; i++) { v.fromBufferAttribute(P, i).applyMatrix4(B); if (NA) nv.fromBufferAttribute(NA, i).applyMatrix3(NB).normalize();
    const e = v.distanceTo(eL) < v.distanceTo(eR) ? 0 : 1; let j0 = -1, j1 = -1, d0 = Infinity, d1 = Infinity;
    pts.forEach((p, j) => { if (p.e !== e) return; const d = v.distanceTo(p.a); if (d < d0) { d1 = d0; j1 = j0; d0 = d; j0 = j; } else if (d < d1) { d1 = d; j1 = j; } });
    R.push({ p: v.clone(), nr: nv.clone(), e, w: j1 < 0 ? [[j0, 1]] : [[j0, d1 / (d0 + d1)], [j1, d0 / (d0 + d1)]] }); }
  // the lashes' own shapes are no longer wanted: the lid takes them
  delete g.morphAttributes.position; delete g.morphAttributes.normal;
  const u = new THREE.Vector3(), w = new THREE.Vector3(), o = new THREE.Vector3(), acc = new THREE.Vector3(), an = new THREE.Vector3(), C = [eL, eR];
  const sp = { n: -1, U: null, prev: null };
  for (const p of pts) { p.q = new THREE.Quaternion(); p.d = new THREE.Vector3(); }
  const st = { edge: L.map(x => x.pts.length), lashes: n, shut: shut.map(([, , m, f]) => ({ points: m, most: f })) };
  const update = () => {
    const I = skin.morphTargetInfluences; if (!I) return; for (const [k, j] of shut) I[j] = I[k];   // the lids' shutting goes with the blink
    const sg = skin.geometry, MA = sg.morphAttributes.position || [], rel = sg.morphTargetsRelative;
    if (rel && sp.n !== MA.length) {                                                       // per point of the edges, only the shapes that move it
      sp.n = MA.length; const U = new Set();
      for (const p of pts) { const K = [], F = []; MA.forEach((a, k) => { const x = a.getX(p.i), y = a.getY(p.i), z = a.getZ(p.i); if (Math.abs(x) + Math.abs(y) + Math.abs(z) > 1e-7) { K.push(k); F.push(x, y, z); U.add(k); } });
        p.K = Int32Array.from(K); p.F = Float32Array.from(F); p.o = new THREE.Vector3().fromBufferAttribute(sg.attributes.position, p.i); }
      sp.U = Int32Array.from(U); sp.prev = new Float32Array(MA.length).fill(NaN); }
    // nothing to do while those shapes hold still
    if (rel) { let ch = false; for (const k of sp.U) if (Math.abs((I[k] || 0) - sp.prev[k]) > 1e-5 || sp.prev[k] !== sp.prev[k]) { ch = true; break; } if (!ch) return; for (const k of sp.U) sp.prev[k] = I[k] || 0; }
    // each point of the edges: how it turned about its eye's centre, and how much farther out it went
    for (const p of pts) { if (!rel) shaped(skin, p.i, p.b); else { let x = p.o.x, y = p.o.y, z = p.o.z;
        for (let m = 0; m < p.K.length; m++) { const f = I[p.K[m]]; if (f) { x += p.F[m * 3] * f; y += p.F[m * 3 + 1] * f; z += p.F[m * 3 + 2] * f; } }
        p.b.set(x, y, z).applyMatrix4(skin.bindMatrix); }
      const c = C[p.e]; u.copy(p.a).sub(c); w.copy(p.b).sub(c); const lu = u.length(), lw = w.length(); p.q.setFromUnitVectors(u.normalize(), w.normalize()); p.d.copy(w).multiplyScalar(lw - lu); }
    for (let i = 0; i < n; i++) { const r = R[i], c = C[r.e]; acc.set(0, 0, 0); an.set(0, 0, 0);
      for (const [j, f] of r.w) { const p = pts[j];                                          // turned with the edge about the eye, and out as far as the edge went
        o.copy(r.p).sub(c).applyQuaternion(p.q).add(c).add(p.d); acc.addScaledVector(o, f); an.addScaledVector(o.copy(r.nr).applyQuaternion(p.q), f); }
      acc.applyMatrix4(BI); P.setXYZ(i, acc.x, acc.y, acc.z); if (NA) { an.applyMatrix3(NBI).normalize(); NA.setXYZ(i, an.x, an.y, an.z); } }   // (the normals turn too: a card's lit side stays its lit side)
    P.needsUpdate = true; if (NA) NA.needsUpdate = true;
  };
  // lashes are hair: little shine (a sky reflected in the lower lashes turned them blue)
  for (const M of [].concat(lash.material)) if (M) { if (M.specularIntensity != null) M.specularIntensity = spec; M.envMapIntensity = env; }
  // and fine: the lashes' texture (256 px) four times as large, smoothly, its cover taken only where it is dense (a
  // smoothstep over crisp): each lash a thin line instead of a black blot up close
  if (crisp && typeof document !== "undefined") for (const M of [].concat(lash.material)) { const t = M && M.map, im = t && t.image; if (!im || !im.width || t.userData.crisp) continue;
    try { const S = 4, cv = document.createElement("canvas"); cv.width = im.width * S; cv.height = im.height * S; const x = cv.getContext("2d");
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high"; x.drawImage(im, 0, 0, cv.width, cv.height);
      const d = x.getImageData(0, 0, cv.width, cv.height), A = d.data; for (let i = 3; i < A.length; i += 4) A[i] = 255 * THREE.MathUtils.smoothstep(A[i] / 255, crisp[0], crisp[1]);
      x.putImageData(d, 0, 0); const c = new THREE.CanvasTexture(cv); c.colorSpace = t.colorSpace; c.flipY = t.flipY; c.wrapS = t.wrapS; c.wrapT = t.wrapT; c.anisotropy = 4; c.userData.crisp = true;
      M.map = c; M.needsUpdate = true; } catch (e) { /* a texture the canvas cannot read: kept */ } }
  update(); g.computeBoundingSphere();
  return { ok: true, update, stats: st, edges: pts };
}
