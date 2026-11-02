// The inside of the mouth in shadow. The teeth, the tongue and the mouth's own lining (the inner lips, gums, palate,
// cheeks' insides on the skin) take light only through the opening between the lips: the shadow map is far too
// coarse for a mouth, so without this the inside is lit as brightly as the face (pink tongue, white molars, a white
// line of teeth between closed lips).
//
// How much light a point inside gets is the share of its view that the opening fills: the opening is taken as a disk
// of the same area as the lips' gap (half its width times half its height), at the gap's middle, and a point at a
// distance d from it sees 1 - d / sqrt(d^2 + r^2) of it (r the disk's radius): the front teeth of an open mouth half,
// the molars a few per cent, everything behind closed lips nearly nothing. The gap is measured each frame from the
// lips' own points with the face's shapes on them (jawOpen, a smile, a viseme, a performance from video all count).
import * as THREE from "three";

// points of the skin that give the opening: the middle of the upper lip's lower edge, of the lower lip's upper edge,
// and the two corners. From the face's ARKit shapes: jawOpen moves the lower lip and not the upper, mouthSmile*
// moves the corners most.
export function mouthPoints(skin) {
  const g = skin.geometry, P = g.attributes.position, N = g.attributes.normal, D = skin.morphTargetDictionary || {}, MA = g.morphAttributes.position || [], n = P.count;
  if (D.jawOpen == null || D.mouthSmileLeft == null || D.mouthSmileRight == null || !N) return null;
  const B = skin.bindMatrix, v = new THREE.Vector3(), w = new THREE.Vector3(), NB = new THREE.Matrix3().getNormalMatrix(B);
  const mv = (k, i) => Math.hypot(MA[k].getX(i), MA[k].getY(i), MA[k].getZ(i));
  // the lips' gap at rest: where the upper lip's under side (facing down, not moved by the jaw) and the lower lip's
  // upper side (facing up, moved by it) meet in the middle of the face
  let up = -1, upY = Infinity, lo = -1, loY = -Infinity, mid = 0;
  const X = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { v.fromBufferAttribute(P, i).applyMatrix4(B); X[i * 3] = v.x; X[i * 3 + 1] = v.y; X[i * 3 + 2] = v.z; }
  let zMax = -Infinity, cx = 0, cy = 0; for (let i = 0; i < n; i++) if (Math.abs(X[i * 3]) < 1e-4 && mv(D.jawOpen, i) > .005 && X[i * 3 + 2] > zMax) { zMax = X[i * 3 + 2]; cy = X[i * 3 + 1]; }   // the chin's front
  if (!isFinite(zMax)) return null;
  for (let i = 0; i < n; i++) { const x = X[i * 3], y = X[i * 3 + 1], z = X[i * 3 + 2]; if (Math.abs(x) > 1e-4 || z < zMax - .03 || y < cy || y > cy + .06) continue;
    w.fromBufferAttribute(N, i).applyMatrix3(NB).normalize(); const j = mv(D.jawOpen, i);
    if (w.y < -.8 && j < 1e-4 && y < upY) { upY = y; up = i; }
    if (w.y > .8 && j > .005 && y > loY) { loY = y; lo = i; } }
  if (up < 0 || lo < 0 || upY - loY > .006) return null; mid = (upY + loY) / 2;
  // the corners: what a smile moves most, near the gap's height
  const corner = k => { let b = -1, bm = 0; for (let i = 0; i < n; i++) { if (Math.abs(X[i * 3 + 1] - mid) > .012 || X[i * 3 + 2] < zMax - .04) continue; const m = mv(k, i); if (m > bm) { bm = m; b = i; } } return b; };
  const cL = corner(D.mouthSmileLeft), cR = corner(D.mouthSmileRight); if (cL < 0 || cR < 0 || cL === cR) return null;
  return { up, lo, cL, cR, X };
}

// inside the mouth, 0..1 per point of the skin: the mouth's lining, found by spreading over the skin's edges from the
// points deep behind the lips, and stopped where the face outside begins. The lining meets the face only along the
// lips' edge, so nothing else is reached.
function insideMask(skin, M) {
  const g = skin.geometry, n = g.attributes.position.count, X = M.X;
  const U = M.up * 3, L = M.lo * 3, cy = (X[U + 1] + X[L + 1]) / 2, cz = (X[U + 2] + X[L + 2]) / 2, hw = Math.abs(X[M.cL * 3] - X[M.cR * 3]) / 2;
  const idx = g.index ? g.index.array : null; if (!idx) return { A: new Float32Array(n), points: 0 };
  const box = i => Math.abs(X[i * 3]) < hw + .03 && X[i * 3 + 1] > cy - .05 && X[i * 3 + 1] < cy + .06 && X[i * 3 + 2] < cz + .006 && X[i * 3 + 2] > cz - .13;
  // the face outside is what is seen from straight in front with the mouth shut: a depth buffer of the skin, seen
  // along -z, half a millimetre a cell; a point within 0.8 mm of the front is outside
  const cell = .0005, x0 = -hw - .035, y0 = cy - .055, nx = Math.ceil((2 * hw + .07) / cell), ny = Math.ceil(.12 / cell), Z = new Float32Array(nx * ny).fill(-Infinity);
  for (let t = 0; t < idx.length; t += 3) { const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ax = (X[a] - x0) / cell, ay = (X[a + 1] - y0) / cell, bx = (X[b] - x0) / cell, by = (X[b + 1] - y0) / cell, cx = (X[c] - x0) / cell, cy2 = (X[c + 1] - y0) / cell;
    const i0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), i1 = Math.min(nx - 1, Math.ceil(Math.max(ax, bx, cx))), j0 = Math.max(0, Math.floor(Math.min(ay, by, cy2))), j1 = Math.min(ny - 1, Math.ceil(Math.max(ay, by, cy2)));
    if (i0 > i1 || j0 > j1) continue; const den = (by - cy2) * (ax - cx) + (cx - bx) * (ay - cy2); if (Math.abs(den) < 1e-9) continue;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const px = i + .5, py = j + .5;
      const u = ((by - cy2) * (px - cx) + (cx - bx) * (py - cy2)) / den, v = ((cy2 - ay) * (px - cx) + (ax - cx) * (py - cy2)) / den, w2 = 1 - u - v;
      if (u < -.05 || v < -.05 || w2 < -.05) continue; const z = u * X[a + 2] + v * X[b + 2] + w2 * X[c + 2], q = j * nx + i; if (z > Z[q]) Z[q] = z; } }
  const outer = i => { const gi = Math.floor((X[i * 3] - x0) / cell), gj = Math.floor((X[i * 3 + 1] - y0) / cell); if (gi < 0 || gj < 0 || gi >= nx || gj >= ny) return true;
    let f = -Infinity; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = gi + di, jj = gj + dj; if (ii >= 0 && jj >= 0 && ii < nx && jj < ny) f = Math.max(f, Z[jj * nx + ii]); }
    return X[i * 3 + 2] > f - .0008; };
  // the mesh's seams (one point split in two for the texture) joined by position, for the spreading
  const key = new Map(), W = new Int32Array(n);
  for (let i = 0; i < n; i++) { const k = Math.round(X[i * 3] * 2e4) + "," + Math.round(X[i * 3 + 1] * 2e4) + "," + Math.round(X[i * 3 + 2] * 2e4); let q = key.get(k); if (q == null) key.set(k, q = i); W[i] = q; }
  const adj = new Map(), add = (a, b) => { let s = adj.get(a); if (!s) adj.set(a, s = []); s.push(b); };
  for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = W[idx[t + e]], b = W[idx[t + (e + 1) % 3]]; if (box(a) && box(b)) { add(a, b); add(b, a); } }
  const In = new Uint8Array(n), Q = [];
  for (let i = 0; i < n; i++) if (W[i] === i && box(i) && Math.abs(X[i * 3]) < hw && Math.abs(X[i * 3 + 1] - cy) < .02 && X[i * 3 + 2] < cz - .03) { In[i] = 1; Q.push(i); }
  while (Q.length) { const a = Q.pop(); for (const b of adj.get(a) || []) if (!In[b] && !outer(b)) { In[b] = 1; Q.push(b); } }
  // and the ring of the face's points next to the lining, most of the way: the triangles that join the two stretch
  // over the mouth's corners when it opens wide, and would fade from dark to lit across them
  const F = new Float32Array(n); for (let i = 0; i < n; i++) if (In[i]) { F[i] = 1; for (const b of adj.get(i) || []) if (!In[b]) F[b] = Math.max(F[b], .5); }
  const A = new Float32Array(n); let k = 0; for (let i = 0; i < n; i++) { A[i] = F[W[i]]; if (In[W[i]]) k++; }
  return { A, points: k };
}

// a point of a mesh with the shapes' weights on it (bind space)
function shaped(mesh, i, out) {
  const g = mesh.geometry, P = g.attributes.position, MA = g.morphAttributes.position || [], I = mesh.morphTargetInfluences || [], rel = g.morphTargetsRelative;
  out.fromBufferAttribute(P, i); const x = out.x, y = out.y, z = out.z;
  for (let k = 0; k < I.length; k++) { const f = I[k], a = MA[k]; if (!f || !a) continue;
    if (rel) { out.x += a.getX(i) * f; out.y += a.getY(i) * f; out.z += a.getZ(i) * f; } else { out.x += (a.getX(i) - x) * f; out.y += (a.getY(i) - y) * f; out.z += (a.getZ(i) - z) * f; } }
  return out.applyMatrix4(mesh.bindMatrix);
}

// the shadow in a material: each light term times the point's view of the opening (specular twice: a highlight
// needs the light and the eye both through the gap). aMouthIn: 0 outside the mouth, 1 inside.
function hook(mat, U) {
  if (mat.userData.mouthHooked) return; mat.userData.mouthHooked = true;
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => "";
  mat.onBeforeCompile = (sh, r) => { prev && prev.call(mat, sh, r); Object.assign(sh.uniforms, U);
    sh.vertexShader = "attribute float aMouthIn; uniform vec4 uMouthA; uniform vec4 uMouthK; uniform mat4 uMouthB; varying float vMouth;\n" + sh.vertexShader.replace("#include <morphtarget_vertex>", `#include <morphtarget_vertex>
 { vec3 p = (uMouthB * vec4(transformed, 1.)).xyz, d = p - uMouthA.xyz; float l = max(length(d), uMouthK.y), r2 = uMouthA.w * uMouthA.w;
   float vis = 1. - l * inversesqrt(l * l + r2) * smoothstep(-.004, .006, -d.z);           // in front of the gap: all
   vMouth = mix(1., uMouthK.x + (1. - uMouthK.x) * vis, aMouthIn * uMouthK.z); }`);
    sh.fragmentShader = "uniform vec4 uMouthK; uniform vec3 uMouthT; varying float vMouth;\n" + sh.fragmentShader.replace("#include <dithering_fragment>", "#include <dithering_fragment>\n if (uMouthK.w > .5) gl_FragColor = vec4(vec3(vMouth), 1.);").replace("#include <aomap_fragment>", `#include <aomap_fragment>
 { vec3 mt = vMouth * mix(uMouthT, vec3(1.), vMouth);                                   // what light gets deep in has bounced off the red lining
   reflectedLight.directDiffuse *= mt; reflectedLight.indirectDiffuse *= mt; reflectedLight.directSpecular *= vMouth * vMouth; reflectedLight.indirectSpecular *= vMouth * vMouth; }`); };
  mat.customProgramCacheKey = () => "mouth|" + prevKey(); mat.needsUpdate = true;
}

// body: a HumanBody with an ARKit face. opt: floor (the light left in the dark, 0..1), soft (m: distances to the gap
// shorter count as this, so the lips' own inner edges darken as the lips close), open (the opening's radius times
// this: light bounced off the lips and the face comes in too), tint (the colour the dark takes: the light that
// gets in has bounced off the red lining), upperTeeth (m: the upper teeth this much lower, once; the model's sit
// above the lips' line, and a smile shows none), amount (0 off .. 1), debug (the light share drawn in grey). Returns { ok, update(), stats, U }
export function mouthLook(body, { floor = .05, soft = .002, open = 1.4, tint = "#d49a92", upperTeeth = 0, amount = 1, debug = false } = {}) {
  const skin = body.parts.get("Body"); if (!skin || !skin.isSkinnedMesh) return { ok: false, error: "no skin" };
  const M = mouthPoints(skin); if (!M) return { ok: false, error: "no ARKit mouth shapes" };
  const U = { uMouthA: { value: new THREE.Vector4() }, uMouthK: { value: new THREE.Vector4(floor, soft, amount, debug ? 1 : 0) }, uMouthB: { value: new THREE.Matrix4() }, uMouthT: { value: new THREE.Color(tint) } };
  const inn = insideMask(skin, M), parts = [[skin, inn.A]];
  const teeth = body.parts.get("Teeth"), TD = teeth && teeth.morphTargetDictionary;
  if (upperTeeth && TD && TD.jawOpen != null && !teeth.userData.upperDrop) { const g = teeth.geometry, P = g.attributes.position, J = g.morphAttributes.position[TD.jawOpen], dn = new THREE.Vector3(0, -upperTeeth, 0).transformDirection(teeth.bindMatrixInverse).multiplyScalar(upperTeeth);
    for (let i = 0; i < P.count; i++) if (Math.hypot(J.getX(i), J.getY(i), J.getZ(i)) < 1e-4) P.setXYZ(i, P.getX(i) + dn.x, P.getY(i) + dn.y, P.getZ(i) + dn.z);      // the upper teeth: what the jaw does not move
    P.needsUpdate = true; g.computeBoundingSphere(); teeth.userData.upperDrop = upperTeeth; }
  for (const name of ["Teeth", "Tongue"]) { const m = body.parts.get(name); if (m && m.geometry) parts.push([m, new Float32Array(m.geometry.attributes.position.count).fill(1)]); }
  const mats = [];
  for (const [m, A] of parts) { m.geometry.setAttribute("aMouthIn", new THREE.BufferAttribute(A, 1));
    // each mesh its own uniforms for the bind matrix; the opening's are shared
    const u = { ...U, uMouthB: { value: m.isSkinnedMesh ? m.bindMatrix.clone() : new THREE.Matrix4() } };
    for (const mat of [].concat(m.material)) if (mat) { hook(mat, u); mats.push(mat); } }
  // meshes that share the skin's material but have no aMouthIn: 0 (outside)
  body.root.traverse(o => { if (!o.isMesh || o.geometry.attributes.aMouthIn) return; if ([].concat(o.material).some(x => x && x.userData.mouthHooked)) o.geometry.setAttribute("aMouthIn", new THREE.BufferAttribute(new Float32Array(o.geometry.attributes.position.count), 1)); });
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e = new THREE.Vector3();
  const st = { inside: inn.points, teeth: parts.length > 1, gap: 0, width: 0 };
  const update = () => {
    shaped(skin, M.up, a); shaped(skin, M.lo, b); shaped(skin, M.cL, c); shaped(skin, M.cR, e);
    const gap = Math.max(0, a.y - b.y), wid = c.distanceTo(e), r = open * Math.sqrt(Math.max(0, gap / 2 * wid / 2));
    U.uMouthA.value.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, r); st.gap = gap; st.width = wid;
  };
  update();
  return { ok: true, update, stats: st, U, setAmount: v => { U.uMouthK.value.z = v; } };
}
