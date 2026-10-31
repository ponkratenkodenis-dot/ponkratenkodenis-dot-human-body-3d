// Skin that differs over the face and the body, as a person's does, for the skin material made in body.js. The mesh
// and its texture stay; what is added is worked out once from the mesh at load, per point, and used in the skin shader:
// - zones of the face (from the eyes' places, in the bind pose): forehead, nose and chin are oilier (less rough, a
//   brighter highlight), the cheeks drier with bigger pores, the lips glossy without pores;
// - folds (how much a point lies below its neighbours): less sky and less highlight in the creases (nose to mouth,
//   the eyes' corners, under the lips, the ear's shell, between the fingers), the way a real crease is a little shadowed;
// - thin parts (how far the skin's other side is under a point): light from behind comes through red (ears, the
//   nostrils' wings), as it does against the sun.
import * as THREE from "three";

const sm = THREE.MathUtils.smoothstep;
const band = (x, a, b, c, e) => sm(x, a, b) * (1 - sm(x, c, e));            // 0 below a, 1 over b..c, 0 past e

// light under the skin, pre-integrated (Penner): how much light a point of skin gives back for a light at angle theta,
// on a surface of curvature 1/r, when light spreads under the skin by its diffusion profile (d'Eon and Luebke's sum of
// six gaussians for skin, variances in mm^2, weights for red, green, blue). Red spreads furthest: on a nose, an ear, a
// finger the shadow's edge is soft and red; on a cheek or a back it stays near plain diffuse. A table of
// cos(theta) * .5 + .5 (x) by curvature / kMax (y), made once
const PROFILE = [[.0064, .233, .455, .649], [.0484, .1, .336, .344], [.187, .118, .198, 0], [.567, .113, .007, .007], [1.99, .358, .004, 0], [7.41, .078, 0, 0]];
let LUT = null;
export function skinLut(kMax = .5, NX = 64, NY = 32, S = 192) {
  if (LUT && LUT.userData.kMax === kMax) return LUT;
  const d = new Uint16Array(NX * NY * 4), H = THREE.DataUtils.toHalfFloat;
  for (let j = 0; j < NY; j++) { const k = j / (NY - 1) * kMax, r = k > 0 ? 1 / k : 0;
    for (let i = 0; i < NX; i++) { const c = 2 * i / (NX - 1) - 1, th = Math.acos(c), o = (j * NX + i) * 4; let out = [Math.max(c, 0), Math.max(c, 0), Math.max(c, 0)];
      if (r > 0) { const num = [0, 0, 0], den = [0, 0, 0];
        for (let s = 0; s < S; s++) { const x = -Math.PI + (s + .5) / S * 2 * Math.PI, dist = 2 * r * Math.abs(Math.sin(x / 2)), cl = Math.max(0, Math.cos(th + x));
          for (const [v, wr, wg, wb] of PROFILE) { const g = Math.exp(-dist * dist / (2 * v)) / v; num[0] += cl * wr * g; num[1] += cl * wg * g; num[2] += cl * wb * g; den[0] += wr * g; den[1] += wg * g; den[2] += wb * g; } }
        out = num.map((a, q) => a / Math.max(den[q], 1e-12)); }
      d[o] = H(out[0]); d[o + 1] = H(out[1]); d[o + 2] = H(out[2]); d[o + 3] = H(1); } }
  LUT = new THREE.DataTexture(d, NX, NY, THREE.RGBAFormat, THREE.HalfFloatType); LUT.magFilter = LUT.minFilter = THREE.LinearFilter; LUT.wrapS = LUT.wrapT = THREE.ClampToEdgeWrapping;
  LUT.colorSpace = THREE.NoColorSpace; LUT.userData.kMax = kMax; LUT.needsUpdate = true; return LUT;
}

// per point of the skin: aSkin = (forehead+chin, nose, cheeks, lips), aSkin2 = (fold, thin, curvature in 1/mm)
export function skinMaps(mesh, { eyes, head, lip = null, foldLo = .03, foldHi = .16, thinLo = .004, thinHi = .012 } = {}) {
  const g = mesh.geometry, P = g.attributes.position, N = g.attributes.normal, n = P.count, B = mesh.bindMatrix, NM = new THREE.Matrix3().getNormalMatrix(B);
  const X = new Float32Array(n * 3), Nn = new Float32Array(n * 3), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) { v.fromBufferAttribute(P, i).applyMatrix4(B); X[i * 3] = v.x; X[i * 3 + 1] = v.y; X[i * 3 + 2] = v.z;
    v.fromBufferAttribute(N, i).applyMatrix3(NM).normalize(); Nn[i * 3] = v.x; Nn[i * 3 + 1] = v.y; Nn[i * 3 + 2] = v.z; }

  // ---- zones, in a frame on the face: x across, y up, f forward, from the point between the eyes, in eye distances
  const Z = new Float32Array(n * 4), face = new Float32Array(n), F = new Float32Array(n * 3);
  if (eyes) {
    const c = eyes[0].clone().add(eyes[1]).multiplyScalar(.5), d = eyes[0].distanceTo(eyes[1]);
    const fw = head ? c.clone().sub(head) : new THREE.Vector3(0, 0, 1); fw.y = 0; if (fw.lengthSq() < 1e-8) fw.set(0, 0, 1); fw.normalize();
    const sd = new THREE.Vector3(0, 1, 0).cross(fw).normalize();
    for (let i = 0; i < n; i++) {
      const px = X[i * 3] - c.x, py = X[i * 3 + 1] - c.y, pz = X[i * 3 + 2] - c.z;
      const xs = (px * sd.x + pz * sd.z) / d, x = Math.abs(xs), y = py / d, f = (px * fw.x + pz * fw.z) / d;
      const nf = Nn[i * 3] * fw.x + Nn[i * 3 + 2] * fw.z;                   // facing forward
      if (y < -3 || y > 2.5 || x > 1.6 || f < -1.2) continue;
      const front = sm(nf, -.1, .35);
      const forehead = band(y, .3, .6, 1.2, 1.65) * (1 - sm(x, .7, 1.05)) * front;
      const chin = band(y, -2.45, -2.2, -1.85, -1.65) * (1 - sm(x, .3, .5)) * front;
      const nose = band(y, -1.05, -.9, -.1, .2) * (1 - sm(x, .13, .26)) * sm(f, .1, .3);
      const cx = (x - .72) / .42, cy = (y + .7) / .45, cheek = (1 - sm(Math.hypot(cx, cy), .55, 1)) * front;
      const L = lip ? lip[i] : 0;
      face[i] = band(y, -2.6, -2.3, .7, 1) * (1 - sm(x, .95, 1.15)) * sm(f, -.45, -.25);   // (not the ears)
      // where the face is for the wrinkles: across (+ = her left), up, and how much of the face this is
      F[i * 3] = xs; F[i * 3 + 1] = y; F[i * 3 + 2] = band(y, -2.6, -2.3, 1.45, 1.75) * (1 - sm(x, 1, 1.2)) * sm(f, -.5, -.3) * front * (1 - L);
      Z[i * 4] = Math.max(forehead, chin) * (1 - L); Z[i * 4 + 1] = nose * (1 - L); Z[i * 4 + 2] = cheek * (1 - nose) * (1 - L); Z[i * 4 + 3] = L;
    }
  }

  // ---- the mesh with its seams joined (a point split for the texture is one point here)
  const key = new Map(), W = new Int32Array(n); let m = 0;
  for (let i = 0; i < n; i++) { const k = Math.round(X[i * 3] * 1e4) + "," + Math.round(X[i * 3 + 1] * 1e4) + "," + Math.round(X[i * 3 + 2] * 1e4);
    let j = key.get(k); if (j == null) { j = m++; key.set(k, j); } W[i] = j; }
  const Q = new Float32Array(m * 3), QN = new Float32Array(m * 3);
  for (let i = 0; i < n; i++) { const j = W[i]; for (let a = 0; a < 3; a++) { Q[j * 3 + a] = X[i * 3 + a]; QN[j * 3 + a] += Nn[i * 3 + a]; } }
  for (let j = 0; j < m; j++) { const l = Math.hypot(QN[j * 3], QN[j * 3 + 1], QN[j * 3 + 2]) || 1; QN[j * 3] /= l; QN[j * 3 + 1] /= l; QN[j * 3 + 2] /= l; }
  const nb = Array.from({ length: m }, () => new Set()), ix = g.index ? g.index.array : null, tc = ix ? ix.length : n;
  for (let t = 0; t < tc; t += 3) { const a = W[ix ? ix[t] : t], b = W[ix ? ix[t + 1] : t + 1], e = W[ix ? ix[t + 2] : t + 2];
    if (a !== b) { nb[a].add(b); nb[b].add(a); } if (b !== e) { nb[b].add(e); nb[e].add(b); } if (a !== e) { nb[a].add(e); nb[e].add(a); } }

  // ---- folds: how far the neighbours' middle lies above the point along its normal, per the edges' length; two rings
  let C = new Float32Array(m);
  for (let j = 0; j < m; j++) { const s = nb[j]; if (!s.size) continue; let cx = 0, cy = 0, cz = 0, el = 0;
    for (const k of s) { const dx = Q[k * 3] - Q[j * 3], dy = Q[k * 3 + 1] - Q[j * 3 + 1], dz = Q[k * 3 + 2] - Q[j * 3 + 2]; cx += dx; cy += dy; cz += dz; el += Math.hypot(dx, dy, dz); }
    C[j] = (cx * QN[j * 3] + cy * QN[j * 3 + 1] + cz * QN[j * 3 + 2]) / el; }
  for (let it = 0; it < 2; it++) { const D = new Float32Array(m); for (let j = 0; j < m; j++) { let s = C[j] * 2, w = 2; for (const k of nb[j]) { s += C[k]; w++; } D[j] = s / w; } C = D; }

  // ---- curvature (1/mm) for the light under the skin: from each neighbour, 2 d.n / |d|^2 (a sphere of radius r gives
  // 1/r); bulges count fully, hollows half (light spreads in a crease too, less visibly); smoothed over two rings
  let K = new Float32Array(m);
  for (let j = 0; j < m; j++) { const s = nb[j]; if (!s.size) continue; let k = 0;
    for (const q of s) { const dx = Q[j * 3] - Q[q * 3], dy = Q[j * 3 + 1] - Q[q * 3 + 1], dz = Q[j * 3 + 2] - Q[q * 3 + 2], l2 = dx * dx + dy * dy + dz * dz; if (l2 > 1e-12) k += 2 * (dx * QN[j * 3] + dy * QN[j * 3 + 1] + dz * QN[j * 3 + 2]) / l2; }
    k /= s.size * 1000; K[j] = k > 0 ? k : -.5 * k; }
  for (let it = 0; it < 2; it++) { const D = new Float32Array(m); for (let j = 0; j < m; j++) { let s = K[j] * 2, w = 2; for (const k of nb[j]) { s += K[k]; w++; } D[j] = s / w; } K = D; }

  // ---- thin: the nearest skin facing the other way, behind the point along its normal (a grid of 1.5 cm cells)
  const cs = thinHi * 1.25, grid = new Map(), ck = (a, b, e) => ((a + 512) * 1024 + (b + 512)) * 1024 + (e + 512), cell = (x, y, z) => ck(Math.floor(x / cs), Math.floor(y / cs), Math.floor(z / cs));
  for (let j = 0; j < m; j++) { const k = cell(Q[j * 3], Q[j * 3 + 1], Q[j * 3 + 2]); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(j); }
  const T = new Float32Array(m);
  for (let j = 0; j < m; j++) { const x = Q[j * 3], y = Q[j * 3 + 1], z = Q[j * 3 + 2], nx = QN[j * 3], ny = QN[j * 3 + 1], nz = QN[j * 3 + 2];
    const gx = Math.floor(x / cs), gy = Math.floor(y / cs), gz = Math.floor(z / cs); let best = Infinity;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let e = -1; e <= 1; e++) { const l = grid.get(ck(gx + a, gy + b, gz + e)); if (!l) continue;
      for (const k of l) { if (QN[k * 3] * nx + QN[k * 3 + 1] * ny + QN[k * 3 + 2] * nz > -.3) continue;
        const dx = Q[k * 3] - x, dy = Q[k * 3 + 1] - y, dz = Q[k * 3 + 2] - z, t = -(dx * nx + dy * ny + dz * nz); if (t <= 0) continue;
        const side = Math.hypot(dx + t * nx, dy + t * ny, dz + t * nz); if (side < Math.max(.003, t * .5) && t < best) best = t; } }
    T[j] = 1 - sm(best, thinLo, thinHi); }
  { const D = new Float32Array(m); for (let j = 0; j < m; j++) { let s = T[j] * 2, w = 2; for (const k of nb[j]) { s += T[k]; w++; } D[j] = s / w; } T.set(D); }

  const Z2 = new Float32Array(n * 3), st = { forehead: 0, nose: 0, cheeks: 0, lips: 0, folds: 0, thin: 0 };
  { const s = Array.from(C).sort((a, b) => a - b), q = p => +s[Math.floor(p * (s.length - 1))].toFixed(3); st.foldQ = [q(.5), q(.8), q(.9), q(.95), q(.98), q(.995)]; }
  { const s = Array.from(K).sort((a, b) => a - b), q = p => +s[Math.floor(p * (s.length - 1))].toFixed(3); st.curvQ = [q(.1), q(.5), q(.9), q(.98)]; }
  for (let i = 0; i < n; i++) { const j = W[i]; Z2[i * 3] = sm(C[j], foldLo, foldHi); Z2[i * 3 + 1] = T[j] * (1 - face[i]); Z2[i * 3 + 2] = K[j];
    if (Z[i * 4] > .5) st.forehead++; if (Z[i * 4 + 1] > .5) st.nose++; if (Z[i * 4 + 2] > .5) st.cheeks++; if (Z[i * 4 + 3] > .5) st.lips++; if (Z2[i * 3] > .5) st.folds++; if (Z2[i * 3 + 1] > .5) st.thin++; }
  g.setAttribute("aSkin", new THREE.BufferAttribute(Z, 4)); g.setAttribute("aSkin2", new THREE.BufferAttribute(Z2, 3)); g.setAttribute("aFace", new THREE.BufferAttribute(F, 3));
  return st;
}

// the skin shader's part: rough = (forehead+chin, nose, cheeks, lips) roughness, pores = the pores' depth there (1 =
// as elsewhere), spec = the highlight's strength there (1 = as elsewhere), fold = (sky, highlight, sun) taken away
// in the deepest creases, thin = how much light comes through, thinColor its colour
// sss = the share of the pre-integrated light under the skin against skin-detail.js's even wrap (the wrap is far
// wider than skin's few millimetres: warm, but waxy alone; the table alone is true to the profile, which on a face's
// centimetre radii is a narrow red edge), curvGain scales the curvature (= widens the profile that many times: the mesh
// is smoothed and has no fine relief), curvMin is curvature every point has at least, shadowSoft how far red reaches
// into a shadow's edge
export function skinLook(mat, { rough = [.38, .33, .54, .3], pores = [1.1, 1.8, 1.45, .2], spec = [1.35, 1.5, .9, 1.6], fold = [.5, .75, .2], thin = .5, thinColor = "#ff4a2a", wrinkles = 1, wrinkleDepth = .0005,
  sss = .6, curvGain = 3, curvMin = .02, shadowSoft = 1, kMax = .5, debug = 0 } = {}) {
  const U = mat.userData.skinU || (mat.userData.skinU = { uSkR: { value: new THREE.Vector4() }, uSkP: { value: new THREE.Vector4() }, uSkS: { value: new THREE.Vector4() },
    uSkF: { value: new THREE.Vector3() }, uSkT: { value: new THREE.Color() }, uSkDbg: { value: 0 }, uWrA: { value: 0 }, uSkC: { value: new THREE.Vector4() }, uSkLut: { value: null },
    uWF: { value: new THREE.Vector3() }, uWD: { value: new THREE.Vector2() }, uWS: { value: new THREE.Vector2() }, uWN: { value: new THREE.Vector2() }, uWM: { value: new THREE.Vector2() } });
  U.uSkR.value.fromArray(rough); U.uSkP.value.fromArray(pores); U.uSkS.value.fromArray(spec); U.uSkF.value.fromArray(fold); U.uSkT.value.set(thinColor).multiplyScalar(thin); U.uSkDbg.value = debug; U.uWrA.value = wrinkles * wrinkleDepth;
  U.uSkLut.value = skinLut(kMax); U.uSkC.value.set(curvGain / kMax, curvMin / kMax, sss, shadowSoft);
  if (mat.userData.skinHooked) return U; mat.userData.skinHooked = true;
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => "";
  const nfm = THREE.ShaderChunk.normal_fragment_maps.replace("mapN.xy *= normalScale;", "{ float zs = dot(vSkin, vec4(1.)); mapN.xy *= normalScale * mix(1., dot(uSkP, vSkin) / max(zs, 1e-4), min(1., zs)); }");
  const lfb = THREE.ShaderChunk.lights_fragment_begin.replace(/(get(?:Point|Spot|Directional)LightInfo\([^;]*\);)/g, "$1 skLc = directLight.color;");
  mat.onBeforeCompile = (sh, r) => { prev && prev.call(mat, sh, r); Object.assign(sh.uniforms, U);
    sh.vertexShader = "attribute vec4 aSkin; attribute vec3 aSkin2; attribute vec3 aFace; varying vec4 vSkin; varying vec3 vSkin2; varying vec3 vFace;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n vSkin = aSkin; vSkin2 = aSkin2; vFace = aFace;");
    let f = "uniform vec4 uSkR; uniform vec4 uSkP; uniform vec4 uSkS; uniform vec3 uSkF; uniform vec3 uSkT; uniform float uSkDbg; varying vec4 vSkin; varying vec3 vSkin2; vec3 skLc = vec3(0.);\n" + WRINKLES + PREINT + sh.fragmentShader;
    // roughness by zone; pores by zone (the weights add up past one only where zones meet, so they are normalised)
    f = f.replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n { float zw = min(1., dot(vSkin, vec4(1.))); roughnessFactor = mix(roughnessFactor, dot(uSkR, vSkin) / max(dot(vSkin, vec4(1.)), 1e-4), zw); }");
    f = f.replace("#include <normal_fragment_maps>", " skNg = normal;\n" + nfm + WRINKLE_NORMAL);
    // the direct light's diffuse: pre-integrated by curvature, red from a smoother normal than blue, red reaching into
    // the shadow's edge (in place of skin-detail.js's even wrap)
    f = f.replace(/vec3 wr = clamp\( \( vec3\( nlw \) \+ W \) \/ \( 1\.0 \+ W \), 0\.0, 1\.0 \); reflectedLight\.directDiffuse \+= wr \* directLight\.color \* BRDF_Lambert\( material\.diffuseColor \);/,
      "vec3 wr = skPreint( geometryNormal, directLight.direction, W, nlw ); reflectedLight.directDiffuse += wr * skShadow( directLight.color ) * BRDF_Lambert( material.diffuseColor );");
    // the highlight: brighter where oily, weaker in the creases
    f = f.replace("#include <lights_physical_fragment>", "#include <lights_physical_fragment>\n { float zs = dot(vSkin, vec4(1.)); float k = mix(1., dot(uSkS, vSkin) / max(zs, 1e-4), min(1., zs)) * (1. - uSkF.y * vSkin2.x);\n material.specularColor *= k * (1. - .6 * skWr); material.specularF90 = min(1., material.specularF90 * k); }");
    // light through the thin parts, from behind: the light as it is before the shadow (the ear's own other side
    // shadows its front)
    f = f.replace("#include <lights_fragment_begin>", lfb);
    const hook = "float nlw = dot( geometryNormal, directLight.direction );";
    if (f.includes(hook)) f = f.replace(hook, hook + `
    if (vSkin2.y > .01) { float bk = saturate(-nlw + .15); float vt = pow(saturate(dot(geometryViewDir, -directLight.direction)), 2.);
      reflectedLight.directDiffuse += vSkin2.y * skLc * uSkT * material.diffuseColor * bk * (.15 + 1.2 * vt); }`);
    // the creases: less sky, less reflection, a little less sun
    f = f.replace("#include <aomap_fragment>", "#include <aomap_fragment>\n { float cv = max(vSkin2.x, skWr * .7); reflectedLight.indirectDiffuse *= 1. - uSkF.x * cv; reflectedLight.indirectSpecular *= 1. - uSkF.y * cv; reflectedLight.directDiffuse *= 1. - uSkF.z * cv; }");
    f = f.replace("#include <dithering_fragment>", "#include <dithering_fragment>\n if (uSkDbg > .5) { gl_FragColor.rgb = uSkDbg < 1.5 ? vec3(vSkin.x + vSkin.w, vSkin.y + vSkin.w * .3, vSkin.z + vSkin.w) : uSkDbg < 2.5 ? vec3(1. - max(vSkin2.x, skWr)) : uSkDbg < 3.5 ? vec3(vSkin2.y, 0., 0.) + .1 : vec3(clamp(vSkin2.z * uSkC.x + uSkC.y, 0., 1.)); }");
    sh.fragmentShader = f; };
  mat.customProgramCacheKey = () => "skinlook|" + prevKey(); mat.needsUpdate = true;
  return U;
}

// wrinkles that come with the face's expression, as in a person: the ARKit shapes' weights each frame pick which
// show and how deep (raised brows: lines across the forehead; frown: two lines between the brows and one over the
// nose; squint and smile: crow's feet and lines under the eyes; sneer: lines on the nose's sides; smile: a deeper
// line from the nose to the mouth). They are drawn in the shader, in the face's own frame (aFace), as a height whose
// slope tilts the normal, and their bottoms take less light.
const WRINKLES = `uniform float uWrA; uniform vec3 uWF; uniform vec2 uWD; uniform vec2 uWS; uniform vec2 uWN; uniform vec2 uWM; varying vec3 vFace; float skWr = 0.;
float wBand(float x, float a, float b, float c, float e) { return smoothstep(a, b, x) * (1. - smoothstep(c, e, x)); }
float wLines(float p, float k) { return pow(.5 + .5 * cos(p * 6.2832), k); }
float wSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0., 1.)); }
// the wrinkles' depth (0..1) at a point of the face: u across (+ = her left), v up, in eye distances from between the eyes
float skWrinkles(vec2 f) {
  float u = f.x, v = f.y, au = abs(u), sd = smoothstep(-.04, .04, u), w = 0.;
  // forehead, raised brows: lines across, a little curved, broken along their length
  float fin = uWF.x * (1. - smoothstep(.25, .7, au)), fout = mix(uWF.z, uWF.y, sd) * smoothstep(.1, .5, au);
  float vv = v + .07 * au * au + .015 * sin(u * 9.);
  w += max(fin, fout) * wBand(v, .5, .65, 1.2, 1.45) * (1. - smoothstep(.7, .95, au)) * wLines(vv / .19, 10.) * (.55 + .45 * sin(u * 6.3 + floor(vv / .19) * 2.1));
  // frown: two lines between the brows, one across the top of the nose
  float fd = mix(uWD.y, uWD.x, sd);
  w += fd * wBand(v, .02, .12, .45, .6) * exp(-pow((au - .1 - .06 * (v - .1)) / .022, 2.));
  w += fd * .6 * exp(-pow((v + .02) / .035, 2.)) * (1. - smoothstep(.08, .18, au));
  // crow's feet at the eyes' outer corners, and lines under the lower lid
  float sq = mix(uWS.y, uWS.x, sd); vec2 cf = vec2(au - .74, v + .02); float r = length(cf), th = atan(cf.y, max(cf.x, 1e-3));
  w += sq * .65 * wBand(r, .06, .11, .24, .33) * smoothstep(.0, .07, cf.x) * wLines(th / .36 + .15 * sin(r * 30.), 10.) * (1. - smoothstep(.55, .95, abs(th))) * (.45 + .55 * sin(th * 7.3 + 1.7));
  w += sq * .35 * wBand(au, .32, .42, .6, .72) * wLines((v + .3 + .25 * (au - .5) * (au - .5)) / .08, 10.) * wBand(v, -.45, -.4, -.24, -.18);
  // sneer: slanted lines on the nose's sides
  float ns = mix(uWN.y, uWN.x, sd);
  w += ns * wBand(au, .05, .09, .2, .26) * wBand(v, -.42, -.36, -.12, -.05) * wLines((v + .8 * au) / .075, 8.);
  // smile: the line from the nose's wing to past the mouth's corner
  float sm = mix(uWM.y, uWM.x, sd);
  w += sm * .8 * exp(-pow(wSeg(vec2(au, v), vec2(.3, -.8), vec2(.62, -1.6)) / .045, 2.));
  return min(w, 1.5);
}
`;
// the light under the skin for one light (see skinLut): N the normal with pores and wrinkles, skNg the mesh's own
const PREINT = `uniform sampler2D uSkLut; uniform vec4 uSkC; vec3 skNg = vec3(0., 0., 1.);
vec3 skPreint(vec3 N, vec3 L, vec3 W, float nlw) {
  vec3 wrap = clamp((vec3(nlw) + W) / (1. + W), 0., 1.);
  if (uSkC.z <= 0.) return wrap;
  float cu = clamp(vSkin2.z * uSkC.x + uSkC.y, 0., 1.);
  vec3 Nr = normalize(mix(N, skNg, .85)), Ng = normalize(mix(N, skNg, .45));
  vec3 d = vec3(dot(Nr, L), dot(Ng, L), dot(N, L)) * .5 + .5;
  vec3 p = vec3(texture(uSkLut, vec2(d.r, cu)).r, texture(uSkLut, vec2(d.g, cu)).g, texture(uSkLut, vec2(d.b, cu)).b);
  return mix(wrap, p, uSkC.z);
}
// the shadow seen through the skin: lit fraction s (the light after the shadow over the light before it), red rising
// sooner at the edge, blue later
vec3 skShadow(vec3 lit) {
  float s = dot(lit, vec3(1.)) / max(dot(skLc, vec3(1.)), 1e-5);
  if (s >= .999 || uSkC.w <= 0.) return lit;
  vec3 sc = vec3(smoothstep(0., .55, s), smoothstep(.04, .8, s), smoothstep(.08, .95, s));
  return skLc * mix(vec3(s), sc, uSkC.w * uSkC.z);
}
`;
const WRINKLE_NORMAL = `
  if (uWrA > 0. && vFace.z > .01) {
    float wd = skWrinkles(vFace.xy) * vFace.z; skWr = min(1., wd);
    float h = -uWrA * wd;                                                          // metres
    vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition), R1 = cross(sy, normal), R2 = cross(normal, sx);
    float det = dot(sx, R1); vec2 dh = vec2(dFdx(h), dFdy(h));
    vec3 g = sign(det) * (dh.x * R1 + dh.y * R2); normal = normalize(abs(det) * normal - g);
  }
`;

// each frame, the face's own shapes (their weights) set how deep each wrinkle is
export function wrinkleDriver(mesh, U) {
  const D = mesh.morphTargetDictionary || {}, I = mesh.morphTargetInfluences; if (!I) return false;
  const w = n => (D[n] != null ? I[D[n]] || 0 : 0), prev = mesh.onBeforeRender;
  mesh.onBeforeRender = function (...a) { prev && prev.apply(this, a);
    U.uWF.value.set(w("browInnerUp"), w("browOuterUpLeft"), w("browOuterUpRight"));
    U.uWD.value.set(w("browDownLeft"), w("browDownRight"));
    U.uWS.value.set(Math.max(w("eyeSquintLeft"), w("cheekSquintLeft") * .8, w("mouthSmileLeft") * .45), Math.max(w("eyeSquintRight"), w("cheekSquintRight") * .8, w("mouthSmileRight") * .45));
    U.uWN.value.set(w("noseSneerLeft"), w("noseSneerRight"));
    U.uWM.value.set(w("mouthSmileLeft"), w("mouthSmileRight")); };
  return true;
}
