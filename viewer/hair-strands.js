// Hair made of strands, for a hairstyle that hangs on a spring chain (hair-spring.js: a ponytail). The model's hair is a
// shell over the scalp and a few broad painted cards for the tail; from afar that reads as hair, close up the tail is a
// handful of paper strips and the shell ends in a cut edge. Here, at load, from the hairstyle's own shape:
// - the tail becomes a few hundred narrow cards (each several hairs wide, its own length, shade and wave), laid along
//   the chain through the volume the old cards filled, gathered into locks toward the ends; skinned to the chain's
//   bones, so it swings exactly as before;
// - over the scalp, cards lie on the shell, combed from where they grow to the tie: the shell's edge breaks into strands
//   and the head reads combed, not painted;
// - a band where the tail is tied.
// The cards turn to face the eye about their own length (in the shadow pass, the light), so a strand never shows its
// edge; across its width the light falls as on a round strand, blended with the volume it belongs to (out from the tail's
// axis, out from the scalp). Highlights along the strands (Kajiya-Kay) as in hair-look.js.
//   const r = hairStrands(body, hairMesh, spring, opt)   ->  { ok, mesh, tie, stats }
import * as THREE from "three";
import { bindData } from "./light-look.js";
import { sstep } from "./hair-spring.js";

const rng = s => () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
const lin = c => { c /= 255; return c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); };

// ---- one texture for every card: hairs running down it (v: root 0 .. tip 1), each its own width, shade, wave, start
// and end (a card's hairs end at different lengths, so its tip frays). R: shade (.5 = the hair's colour), A: coverage
export function strandTexture({ w = 512, h = 1024, hairs = 150, seed = 5 } = {}) {
  const R = rng(seed), A = new Float32Array(w * h), L = new Float32Array(w * h).fill(1);
  for (let k = 0; k < hairs; k++) {
    const x0 = R() * w, beg = R() * .05, end = .45 + .55 * Math.sqrt(R()), wid = .55 + R() * .9, op = .5 + .5 * R(), sh = .55 + .9 * R(),
      amp = .4 + R() * 2.2, per = 120 + R() * 520, ph = R() * 6.283, drift = (R() - .5) * 8;
    for (let y = Math.floor(beg * h); y < end * h; y++) {
      const v = y / h, t = (v - beg) / (end - beg), cx = x0 + Math.sin(v * h / per * 6.283 + ph) * amp + drift * v;
      const ww = wid * (t > .75 ? 1 - (t - .75) / .25 * .6 : 1), a = op * sstep(0, .05, t) * (t > .8 ? 1 - (t - .8) / .2 * .75 : 1);
      for (let x = Math.floor(cx - ww - 1); x <= Math.ceil(cx + ww + 1); x++) {
        if (x < 0 || x >= w) continue;
        const c = Math.max(0, Math.min(1, ww + .5 - Math.abs(x + .5 - cx))) * a; if (c <= 0) continue;
        const i = y * w + x, o = A[i], na = o + c * (1 - o); L[i] = (L[i] * o + sh * c * (1 - o)) / na; A[i] = na;
      }
    }
  }
  const D = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { D[i * 4] = Math.round(Math.min(1, L[i] * .5) * 255); D[i * 4 + 1] = D[i * 4 + 2] = 128; D[i * 4 + 3] = Math.round(A[i] * 255); }
  const t = new THREE.DataTexture(D, w, h, THREE.RGBAFormat); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 4; t.needsUpdate = true;
  return t;
}
let TEX = null;

function readImage(img, size) {
  const c = document.createElement("canvas"); c.width = c.height = size; const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0, size, size); return g.getImageData(0, 0, size, size).data;
}

// ---- the shader: cards facing the eye, round across, lit along the strand
const VERT_PARS = "attribute vec3 aT; attribute vec4 aH; attribute vec3 aB; varying vec3 vHT; varying vec4 vHA; varying vec3 vHB;\n";
// aT: the strand's direction (root to tip), aH: (across -1..1, along 0..1, the strand's own random, half width m),
// aB: (faces the eye 1 / lies on the scalp 0, occlusion, where its hairs start in the texture)
const VERT = `
{
#if defined( USE_SKINNING ) && !defined( LINEAR_SKINNING )
  vec3 hT = (bindMatrixInverse * vec4(dqRot(dqR, (bindMatrix * vec4(aT, 0.)).xyz), 0.)).xyz;   // (dual quaternion skinning, dq-skinning.js)
#elif defined( USE_SKINNING )
  vec3 hT = (skinMatrix * vec4(aT, 0.)).xyz;
#else
  vec3 hT = aT;
#endif
  mat3 M3 = mat3(modelMatrix); float sc = length(M3[0]);
  vec3 wP = (modelMatrix * vec4(transformed, 1.)).xyz, wT = normalize(M3 * hT + 1e-9);
  vec3 E = isOrthographic ? vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]) : normalize(cameraPosition - wP);
  vec3 sd = cross(wT, E);
#ifndef HAIR_DEPTH
  sd = mix(cross(wT, normalize(M3 * objectNormal)), sd, aB.x);
#endif
  sd = normalize(sd + 1e-7);
  transformed += transpose(M3) * sd * (aH.w * aH.x / sc);
  vHT = normalize(mat3(viewMatrix) * wT); vHA = aH; vHB = aB;
}`;
const FRAG_PARS = "uniform sampler2D uHStr; uniform vec4 uHSpec; uniform vec2 uHShine; uniform vec2 uHWrap; uniform vec4 uHCol; uniform float uHUW; varying vec3 vHT; varying vec4 vHA; varying vec3 vHB;\n";
const ALPHA = `
  vec2 huv = vec2(vHB.z + (vHA.x * .5 + .5) * uHUW, vHA.y);
  vec4 htx = texture2D(uHStr, huv);
  vec2 hsz = vec2(textureSize(uHStr, 0)), hdx = dFdx(huv * hsz), hdy = dFdy(huv * hsz);
  float hlod = max(0., .5 * log2(max(dot(hdx, hdx), dot(hdy, hdy))));
  float hcov = min(1., htx.a * (1. + hlod * uHCol.w));   // (a far card's hairs average out thin in the small mips: keep their coverage)`;

function hookMaterial(M, U) {
  M.onBeforeCompile = sh => { Object.assign(sh.uniforms, U);
    sh.vertexShader = VERT_PARS + sh.vertexShader.replace("#include <skinning_vertex>", "#include <skinning_vertex>\n" + VERT);
    sh.fragmentShader = FRAG_PARS + sh.fragmentShader
      .replace("#include <lights_physical_pars_fragment>", `#include <lights_physical_pars_fragment>
vec3 hairT = vec3(0., 1., 0.); float hairJit = 0., hairGlint = 1.; vec3 hairCol = vec3(1.);
void RE_Direct_Strand( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  vec3 N = geometryNormal, L = directLight.direction, V = geometryViewDir, H = normalize(L + V);
  float nl = dot(N, L), w = uHWrap.x, rim = 1. - saturate(abs(dot(N, V)) * 1.4);
  // light through the hair: wrapped round to the dark side, and a glow against the light
  reflectedLight.directDiffuse += directLight.color * BRDF_Lambert(material.diffuseColor) * (saturate((nl + w) / (1. + w)) + uHWrap.y * pow(saturate(dot(-L, V)), 4.) * (.15 + rim));
  vec3 T1 = normalize(hairT + N * (uHSpec.z + hairJit)), T2 = normalize(hairT + N * (uHSpec.w + hairJit));
  float d1 = dot(T1, H), d2 = dot(T2, H), att = smoothstep(-.15, .3, nl) * smoothstep(-.95, -.7, dot(L, V));
  float s1 = pow(sqrt(max(1. - d1 * d1, 0.)), uHShine.x), s2 = pow(sqrt(max(1. - d2 * d2, 0.)), uHShine.y);
  reflectedLight.directSpecular += directLight.color * att * hairGlint * RECIPROCAL_PI * (uHSpec.x * s1 + uHSpec.y * s2 * hairCol);
}
#undef RE_Direct
#define RE_Direct RE_Direct_Strand`)
      .replace("#include <map_fragment>", `#include <map_fragment>
  {${ALPHA}
    float hs = htx.r * 2.;
    diffuseColor.rgb *= hs * (1. + (vHA.z - .5) * uHCol.y) * (1. + uHCol.x * vHA.y * vHA.y);   // (each strand its own shade, the ends lighter)
    diffuseColor.a *= hcov;
    hairGlint = .35 + .9 * smoothstep(.75, 1.3, hs); hairJit = (vHA.z - .5) * .14; hairCol = clamp(diffuseColor.rgb * 1.5 + .02, 0., 1.); }`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
  { vec3 F = normalize(vViewPosition), T = normalize(vHT), S = normalize(cross(T, F) + 1e-6); float x = clamp(vHA.x, -1., 1.);
    vec3 Nc = normalize(F * sqrt(max(1. - x * x * .8, 0.)) + S * x * .9);       // a round strand, seen across
    vec3 Nv = normalize(vNormal);                                              // the volume it belongs to
    normal = normalize(mix(Nc, Nv, mix(.85, uHCol.z, vHB.x)));
    hairT = normalize(T - normal * dot(normal, T) + 1e-6); }`)
      .replace("#include <aomap_fragment>", `#include <aomap_fragment>
  { float o = vHB.y; reflectedLight.indirectDiffuse *= o; reflectedLight.indirectSpecular *= o * .3 * hairCol; reflectedLight.directDiffuse *= mix(1., o, .45); reflectedLight.directSpecular *= mix(1., o, .6); }`);
  };
  M.customProgramCacheKey = () => "hairstrands";
}
function hookDepth(D, U) {
  D.onBeforeCompile = sh => { Object.assign(sh.uniforms, U);
    sh.vertexShader = "#define HAIR_DEPTH\n" + VERT_PARS + sh.vertexShader.replace("#include <skinning_vertex>", "#include <skinning_vertex>\n" + VERT);
    sh.fragmentShader = FRAG_PARS + sh.fragmentShader.replace("#include <alphatest_fragment>", `{${ALPHA}\n diffuseColor.a *= hcov; }\n#include <alphatest_fragment>`);
  };
  D.customProgramCacheKey = () => "hairstrandsdepth";
}

// opt: tail (cards in the tail), edge (of the scalp's cards, those at the hairline), edgeExt (how far past the shell's edge they start, m), shellCut (hair-look.js' cut for the shell under them; null: as it is), shellFlat (its painted shade evened out), taper (the tail narrower toward its end), scalp (cards on the head), seg (points per card), width / scalpWidth (a card's width, m),
// lift (how far over the shell), tieR (the tail's radius at the tie), tie (a band there), keepCards (leave the model's
// own tail cards), clump (how much the ends gather into locks), tipLight (ends lighter), vary (shade from strand to
// strand), vol (how much the tail's volume, against the round strand, sets the light), cover (coverage kept far away),
// spec, spec2, shift, shift2, shine, shine2, wrap, back: as in hair-look.js; color: else the hairstyle's own (its
// texture's average times its colour, warmed by warm)
export function hairStrands(body, mesh, spring, opt = {}) {
  const o = { tail: 340, scalp: 420, seg: 14, width: .009, scalpWidth: .008, lift: .0012, edge: 160, edgeExt: .006, shellCut: .5, shellFlat: .6, tieR: .011, tie: true, keepCards: false, clump: .7, taper: .4,
    tipLight: .15, vary: .3, vol: .45, cover: .35, spec: .2, spec2: .34, shift: -.04, shift2: .06, shine: 90, shine2: 25, wrap: .25, back: .3, color: null, warm: .25, seed: 11, ...opt };
  if (!spring || !spring.ok || !spring.joints || !mesh || !mesh.isSkinnedMesh || !mesh.material || !mesh.material.map || !mesh.material.map.image) return { ok: false, error: "no hair chain or texture" };
  const t0 = performance.now(), R = rng(o.seed), V3 = () => new THREE.Vector3();
  const { X, N, n } = bindData(mesh), g = mesh.geometry, UV = g.attributes.uv, I = g.index ? g.index.array : null, tc = I ? I.length / 3 : n / 3, vi = k => I ? I[k] : k;
  const P = i => new THREE.Vector3(X[i * 3], X[i * 3 + 1], X[i * 3 + 2]), Nv = i => new THREE.Vector3(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
  let img; try { img = readImage(mesh.material.map.image, 256); } catch (e) { return { ok: false, error: "texture not readable: " + e.message }; }
  const alphaAt = (u, v) => { const x = Math.min(255, Math.max(0, (u - Math.floor(u)) * 256 | 0)), y = Math.min(255, Math.max(0, (v - Math.floor(v)) * 256 | 0)); return img[(y * 256 + x) * 4 + 3] / 255; };
  // the hair's colour: its texture where it is hair, times its tint
  const col = new THREE.Color(0, 0, 0); let cw = 0;
  for (let i = 0; i < img.length; i += 4) if (img[i + 3] > 128) { col.r += lin(img[i]); col.g += lin(img[i + 1]); col.b += lin(img[i + 2]); cw++; }
  if (cw) col.multiplyScalar(1 / cw); else col.setRGB(.5, .5, .5); col.multiply(mesh.material.color); col.r *= 1 + o.warm; col.b *= 1 - o.warm * .6; if (o.color) col.set(o.color);   // (the average of the texture reads duller than the painted shell: warm gives back its red)
  const free = new Uint8Array(n); for (const i of spring.free) free[i] = 1;
  const sk = mesh.skeleton, head = sk.bones.findIndex(b => b.name === "head"), base = sk.bones.indexOf(spring.bones[0]), nseg = spring.n;
  if (head < 0 || base < 0) return { ok: false, error: "no head or chain bone" };
  const skull = spring.skull.c;

  // ---- the chain as a smooth curve with frames along it (parallel transport); s: 0 at the root .. nseg at the tip
  const curve = new THREE.CatmullRomCurve3(spring.joints.map(p => p.clone()), false, "centripetal"), NF = 96, FP = [], FT = [], F1 = [], F2 = [];
  for (let k = 0; k <= NF; k++) { FP.push(curve.getPoint(k / NF)); FT.push(curve.getTangent(k / NF).normalize()); }
  let e1 = new THREE.Vector3(1, 0, 0); e1.addScaledVector(FT[0], -e1.dot(FT[0])).normalize();
  for (let k = 0; k <= NF; k++) { if (k) { e1.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(FT[k - 1], FT[k])); e1.addScaledVector(FT[k], -e1.dot(FT[k])).normalize(); } F1.push(e1.clone()); F2.push(FT[k].clone().cross(e1).normalize()); }
  const endLen = FP[NF].distanceTo(FP[NF - 1]) * NF / nseg;
  const frame = s => { const t = s / nseg * NF;
    if (t >= NF) return { p: FP[NF].clone().addScaledVector(FT[NF], (s - nseg) * endLen), t: FT[NF], e1: F1[NF], e2: F2[NF] };
    const k = Math.max(0, Math.min(NF - 1, Math.floor(t))), f = Math.max(0, t - k);
    return { p: FP[k].clone().lerp(FP[k + 1], f), t: FT[k].clone().lerp(FT[k + 1], f).normalize(), e1: F1[k].clone().lerp(F1[k + 1], f).normalize(), e2: F2[k].clone().lerp(F2[k + 1], f).normalize() }; };
  const ab = V3(), ap = V3(), q = V3();
  const along = p => { let best = 1e9, bs = 0; for (let k = 0; k < NF; k++) { ab.subVectors(FP[k + 1], FP[k]); const t = Math.max(0, Math.min(1, ap.subVectors(p, FP[k]).dot(ab) / ab.lengthSq())), d = p.distanceToSquared(q.copy(FP[k]).addScaledVector(ab, t)); if (d < best) { best = d; bs = (k + t) / NF * nseg; } } return bs; };

  // ---- where the hair is: points on the model's tail cards where its texture shows hair, and the scalp's triangles
  const tailPts = [], scalpTri = []; let scalpArea = 0;
  const A = V3(), B = V3(), C = V3();
  for (let t = 0; t < tc; t++) {
    const a = vi(t * 3), b = vi(t * 3 + 1), c = vi(t * 3 + 2), nf = free[a] + free[b] + free[c];
    A.set(X[a * 3], X[a * 3 + 1], X[a * 3 + 2]); B.set(X[b * 3], X[b * 3 + 1], X[b * 3 + 2]); C.set(X[c * 3], X[c * 3 + 1], X[c * 3 + 2]);
    const area = B.clone().sub(A).cross(C.clone().sub(A)).length() / 2;
    if (nf === 3) { const ns = Math.min(10, 1 + Math.round(area / 1.5e-5));
      for (let k = 0; k < ns; k++) { let r1 = R(), r2 = R(); if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; } const r0 = 1 - r1 - r2;
        if (alphaAt(UV.getX(a) * r0 + UV.getX(b) * r1 + UV.getX(c) * r2, UV.getY(a) * r0 + UV.getY(b) * r1 + UV.getY(c) * r2) > .35) tailPts.push(A.clone().multiplyScalar(r0).addScaledVector(B, r1).addScaledVector(C, r2)); } }
    else if (nf === 0 && area > 0) { scalpArea += area; scalpTri.push({ a, b, c, cum: scalpArea }); }
  }
  if (tailPts.length < 50 || scalpTri.length < 20) return { ok: false, error: "too little hair to follow (" + tailPts.length + " tail points)" };

  // ---- the tail's cross-section along the chain: how far out the hair reaches, by s and by angle round the axis
  const NS = 12, NA = 16, sAll = tailPts.map(along), sMax = sAll.slice().sort((x, y) => x - y)[Math.floor(sAll.length * .97)];
  const bins = Array.from({ length: NS * NA }, () => []);
  tailPts.forEach((p, i) => { const s = sAll[i], fr = frame(s), d = p.clone().sub(fr.p), x = d.dot(fr.e1), y = d.dot(fr.e2), an = Math.atan2(y, x);
    const si = Math.min(NS - 1, Math.max(0, s / sMax * NS | 0)), ai = Math.min(NA - 1, (an + Math.PI) / (2 * Math.PI) * NA | 0); bins[si * NA + ai].push(Math.hypot(x, y)); });
  let prof = bins.map(b => { if (b.length < 3) return NaN; b.sort((x, y) => x - y); return b[Math.floor(b.length * .85)]; });
  for (let si = 0; si < NS; si++) { const row = prof.slice(si * NA, si * NA + NA).filter(x => x === x), m = row.length ? row.reduce((x, y) => x + y) / row.length : NaN; for (let ai = 0; ai < NA; ai++) if (!(prof[si * NA + ai] === prof[si * NA + ai])) prof[si * NA + ai] = m; }
  for (let si = 0; si < NS; si++) if (!(prof[si * NA] === prof[si * NA])) for (let ai = 0; ai < NA; ai++) prof[si * NA + ai] = si ? prof[(si - 1) * NA + ai] : .02;
  for (let pass = 0; pass < 2; pass++) prof = prof.map((v, i) => { const si = i / NA | 0, ai = i % NA; return (v * 2 + prof[si * NA + (ai + 1) % NA] + prof[si * NA + (ai + NA - 1) % NA]) / 4; });
  const radius = (s, an) => { const fs = Math.max(0, Math.min(NS - 1.001, s / sMax * NS - .5)), fa = ((an + Math.PI) / (2 * Math.PI) * NA - .5 + NA) % NA;
    const s0 = Math.floor(fs), a0 = Math.floor(fa), ws = fs - s0, wa = fa - a0, a1 = (a0 + 1) % NA, s1 = Math.min(NS - 1, s0 + 1), at = (i, j) => prof[i * NA + j];
    return (at(s0, a0) * (1 - wa) + at(s0, a1) * wa) * (1 - ws) + (at(s1, a0) * (1 - wa) + at(s1, a1) * wa) * ws; };

  // ---- the geometry
  const pos = [], nor = [], aT = [], aH = [], aB = [], skI = [], skW = [], idx = [], uw = .16;
  const addStrand = (pts, nrm, wid, occ, face, weights, rnd) => {
    const m = pts.length, u0 = R() * (1 - uw), first = pos.length / 3;
    for (let j = 0; j < m; j++) {
      const t = pts[Math.min(m - 1, j + 1)].clone().sub(pts[Math.max(0, j - 1)]).normalize(), v = j / (m - 1), w = weights(j);
      for (const side of [-1, 1]) {
        pos.push(pts[j].x, pts[j].y, pts[j].z); nor.push(nrm[j].x, nrm[j].y, nrm[j].z); aT.push(t.x, t.y, t.z);
        aH.push(side, v, rnd, wid[j] / 2); aB.push(face, occ[j], u0);
        for (let k = 0; k < 4; k++) { skI.push(w[k] ? w[k][0] : 0); skW.push(w[k] ? w[k][1] : 0); }
      }
    }
    for (let j = 0; j < m - 1; j++) { const a = first + j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  };
  const chainW = s => { const a = sstep(.2, .6, s), k = Math.min(nseg - 1, Math.max(0, Math.floor(s))), f = Math.min(1, s - k), f2 = k + 1 < nseg ? f : 0, w = [];
    if (1 - a > 1e-4) w.push([head, 1 - a]); if (a * (1 - f2) > 1e-4) w.push([base + k, a * (1 - f2)]); if (a * f2 > 1e-4) w.push([base + k + 1, a * f2]); return w; };

  // the tail: strands through its cross-section, gathering into locks toward the ends
  const K = 34, clumps = Array.from({ length: K }, () => ({ a: R() * 6.283 - Math.PI, r: Math.sqrt(R()) * .8 }));
  const tieS = .08, M = o.seg;
  for (let i = 0; i < o.tail; i++) {
    const cl = clumps[R() * K | 0], a0 = R() * 6.283 - Math.PI, r0 = Math.sqrt(R()), sBeg = .03 + R() * .06, sEnd = sMax * (.68 + .32 * Math.sqrt(R())), ph = R() * 6.283, w0 = o.width * (.7 + .6 * R()), rnd = R();
    const pts = [], nrm = [], wid = [], occ = [], ss = [];
    for (let j = 0; j <= M; j++) {
      const t = j / M, s = sBeg + (sEnd - sBeg) * t, k = o.clump * Math.pow(t, 1.3);
      let da = cl.a - a0; da = Math.atan2(Math.sin(da), Math.cos(da));
      const an = a0 + da * k + .12 * Math.sin(t * 5 + ph), rr = Math.max(0, r0 + (cl.r - r0) * k + .05 * Math.sin(t * 8 + ph * 1.7));
      const fr = frame(s), rad = (o.tieR + (radius(s, an) - o.tieR) * sstep(.04, .55, s)) * (1 - o.taper * Math.pow(Math.min(1, s / sMax), 2)), d = fr.e1.clone().multiplyScalar(Math.cos(an)).addScaledVector(fr.e2, Math.sin(an));
      pts.push(fr.p.clone().addScaledVector(d, rad * rr)); nrm.push(d); wid.push(w0 * (1 - .45 * t)); ss.push(s);
      occ.push((.3 + .7 * Math.min(1, rr) * Math.min(1, rr)) * (.7 + .3 * sstep(.05, .5, s)));
    }
    addStrand(pts, nrm, wid, occ, 1, j => chainW(ss[j]), rnd);
  }
  const tailCards = o.tail;

  // the scalp: combed from where the hair grows to the tie, lying on the shell. Its points (vertices and triangle
  // centres, normals out from the skull) in a grid of 1 cm cells, for the nearest point of the shell
  const cloud = [], cs = .01, grid = new Map(), key = (x, y, z) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
  const addCloud = (p, nn, v) => { if (nn.lengthSq() < 1e-14) return; if (nn.dot(p.clone().sub(skull)) < 0) nn.negate(); const e = { p, n: nn.normalize(), v }; cloud.push(e);
    const k = key(Math.floor(p.x / cs), Math.floor(p.y / cs), Math.floor(p.z / cs)); (grid.get(k) || grid.set(k, []).get(k)).push(e); };
  const seen = new Uint8Array(n);
  for (const T of scalpTri) { for (const v of [T.a, T.b, T.c]) if (!seen[v]) { seen[v] = 1; addCloud(P(v), Nv(v), v); }
    const pa = P(T.a), pb = P(T.b), pc = P(T.c); addCloud(pa.clone().add(pb).add(pc).multiplyScalar(1 / 3), pb.clone().sub(pa).cross(pc.clone().sub(pa)), T.a); }
  const nearest = p => { const x = Math.floor(p.x / cs), y = Math.floor(p.y / cs), z = Math.floor(p.z / cs); let best = null, bd = 1e9;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) { const L = grid.get(key(x + i, y + j, z + k)); if (L) for (const e of L) { const d = e.p.distanceToSquared(p); if (d < bd) { bd = d; best = e; } } }
    return best ? { e: best, d: Math.sqrt(bd) } : null; };
  const SI = mesh.geometry.attributes.skinIndex, SW = mesh.geometry.attributes.skinWeight;
  const ownW = v => { const w = []; for (let k = 0; k < 4; k++) { const x = SW.getComponent(v, k); if (x > 1e-4) w.push([SI.getComponent(v, k), x]); } return w; };
  const tieP = frame(tieS).p, tieT = frame(tieS).t;
  let scalpCards = 0, edgeCards = 0;
  const nScalp = o.scalp + o.edge;
  for (let i = 0, tries = 0; i < nScalp && tries < nScalp * 12; tries++) {
    // where it grows: anywhere on the scalp the texture shows hair (by area); the last o.edge of them at the hairline,
    // where the painted hair thins out: they start a little past the shell's edge, so the edge is strands, not a cut
    const atEdge = i >= o.scalp;
    const r = R() * scalpArea; let lo = 0, hi = scalpTri.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (scalpTri[m].cum < r) lo = m + 1; else hi = m; }
    const T = scalpTri[lo]; let r1 = R(), r2 = R(); if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; } const r0 = 1 - r1 - r2;
    const ha = alphaAt(UV.getX(T.a) * r0 + UV.getX(T.b) * r1 + UV.getX(T.c) * r2, UV.getY(T.a) * r0 + UV.getY(T.b) * r1 + UV.getY(T.c) * r2);
    if (atEdge ? !(ha > .04 && ha < .55) : ha < .3) continue;
    let p = P(T.a).multiplyScalar(r0).addScaledVector(P(T.b), r1).addScaledVector(P(T.c), r2), hit = nearest(p); if (!hit) continue;
    const path = [p.clone()], ns = [hit.e.n.clone()], vs = [hit.e.v]; let nn = hit.e.n.clone(), lastD = p.distanceTo(tieP), stall = 0;
    for (let step = 0; step < 160; step++) {
      const dir = tieP.clone().sub(p), dist = dir.length(); if (dist < o.tieR * 1.8) break;
      dir.addScaledVector(nn, -dir.dot(nn)); if (dir.lengthSq() < 1e-10) break; dir.normalize(); p = p.clone().addScaledVector(dir, .003);
      const h = nearest(p); if (h && h.d < .012) { p.addScaledVector(h.e.n, -p.clone().sub(h.e.p).dot(h.e.n)); nn = h.e.n.clone(); vs.push(h.e.v); } else vs.push(vs[vs.length - 1]);   // (near the tie the shell rises off the skull: straight on)
      path.push(p.clone()); ns.push(nn.clone());
      const d = p.distanceTo(tieP); if (d > lastD - .0005) { if (++stall > 8) break; } else stall = 0; lastD = Math.min(lastD, d);
    }
    if (path.length < 4) continue;
    if (atEdge) {   // back from the root, along the scalp: past the shell's edge
      const d0 = path[0].clone().sub(path[1]), n0 = ns[0]; d0.addScaledVector(n0, -d0.dot(n0)).normalize(); const ext = o.edgeExt * (.5 + R());
      for (const f of [1, .5]) { path.unshift(path[0].clone().addScaledVector(d0, ext * f * (f === 1 ? .5 : 1))); ns.unshift(n0.clone()); vs.unshift(vs[0]); }
    }
    // into the tie
    const into = tieP.clone().addScaledVector(p.clone().sub(tieP).addScaledVector(tieT, -p.clone().sub(tieP).dot(tieT)).normalize(), o.tieR * .7);
    path.push(p.clone().lerp(into, .5), into); ns.push(nn.clone(), nn.clone()); vs.push(vs[vs.length - 1], vs[vs.length - 1]);
    // even points along it, over the shell
    const cum = [0]; for (let k = 1; k < path.length; k++) cum.push(cum[k - 1] + path[k].distanceTo(path[k - 1]));
    const len = cum[cum.length - 1], m = Math.max(4, Math.min(M + 6, Math.round(len / .008))), lift = o.lift * (.6 + .9 * R()), w0 = o.scalpWidth * (.7 + .6 * R()), rnd = R();
    const pts = [], nrm = [], wid = [], occ = [], wv = [];
    for (let j = 0, k = 0; j < m; j++) { const d = len * j / (m - 1); while (k < cum.length - 2 && cum[k + 1] < d) k++; const f = Math.min(1, (d - cum[k]) / Math.max(1e-9, cum[k + 1] - cum[k]));
      const nn2 = ns[k].clone().lerp(ns[k + 1], f).normalize(); pts.push(path[k].clone().lerp(path[k + 1], f).addScaledVector(nn2, lift)); nrm.push(nn2); wid.push(w0 * (1 - .35 * j / (m - 1))); occ.push(.92); wv.push(vs[f < .5 ? k : k + 1]); }
    addStrand(pts, nrm, wid, occ, 0, j => ownW(wv[j]), rnd); i++; scalpCards++; if (atEdge) edgeCards++;
  }

  // ---- the mesh: the hairstyle's bones and bind
  const G = new THREE.BufferGeometry(), inv = mesh.bindMatrix.clone().invert(), NI = new THREE.Matrix3().getNormalMatrix(inv), v = V3();
  for (let i = 0; i < pos.length; i += 3) { v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(inv); pos[i] = v.x; pos[i + 1] = v.y; pos[i + 2] = v.z;
    v.set(nor[i], nor[i + 1], nor[i + 2]).applyMatrix3(NI).normalize(); nor[i] = v.x; nor[i + 1] = v.y; nor[i + 2] = v.z;
    v.set(aT[i], aT[i + 1], aT[i + 2]).transformDirection(inv); aT[i] = v.x; aT[i + 1] = v.y; aT[i + 2] = v.z; }
  G.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); G.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  G.setAttribute("aT", new THREE.Float32BufferAttribute(aT, 3)); G.setAttribute("aH", new THREE.Float32BufferAttribute(aH, 4)); G.setAttribute("aB", new THREE.Float32BufferAttribute(aB, 3));
  G.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skI, 4)); G.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skW, 4)); G.setIndex(idx);
  G.computeBoundingSphere();
  TEX = TEX || strandTexture();
  const U = { uHStr: { value: TEX }, uHSpec: { value: new THREE.Vector4(o.spec, o.spec2, o.shift, o.shift2) }, uHShine: { value: new THREE.Vector2(o.shine, o.shine2) },
    uHWrap: { value: new THREE.Vector2(o.wrap, o.back) }, uHCol: { value: new THREE.Vector4(o.tipLight, o.vary, o.vol, o.cover) }, uHUW: { value: uw } };
  const mat = new THREE.MeshStandardMaterial({ color: col, roughness: .55, metalness: 0, side: THREE.DoubleSide, alphaTest: .35, alphaToCoverage: true, envMapIntensity: .6 });
  hookMaterial(mat, U); mat.userData.strandU = U;
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); hookDepth(depth, U);
  const sm = new THREE.SkinnedMesh(G, mat); sm.name = mesh.name + "_strands"; sm.bind(sk, mesh.bindMatrix); sm.customDepthMaterial = depth;
  sm.frustumCulled = false; sm.castShadow = true; sm.receiveShadow = true; sm.userData.strands = true;
  mesh.parent.add(sm);

  // the band at the tie
  let tieMesh = null;
  if (o.tie) {
    const TG = new THREE.TorusGeometry(o.tieR * 1.05, .0028, 8, 28), qq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tieT), M4 = new THREE.Matrix4().compose(tieP, qq, new THREE.Vector3(1, 1, 1));
    TG.applyMatrix4(M4); TG.applyMatrix4(inv); const tn = TG.attributes.position.count;
    TG.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(tn * 4).map((x, i) => i % 4 ? 0 : head), 4)); TG.setAttribute("skinWeight", new THREE.Float32BufferAttribute(new Float32Array(tn * 4).map((x, i) => i % 4 ? 0 : 1), 4));
    tieMesh = new THREE.SkinnedMesh(TG, new THREE.MeshStandardMaterial({ color: "#16110f", roughness: .45 })); tieMesh.name = mesh.name + "_tie"; tieMesh.bind(sk, mesh.bindMatrix);
    tieMesh.frustumCulled = false; tieMesh.castShadow = true; tieMesh.receiveShadow = true; mesh.parent.add(tieMesh);
  }

  // the model's own tail cards go (all that hangs off the skull). The sky's sheen on the strands is weak and tinted: hair is no glossy shell, and the round-strand normals catch it at a grazing angle
  let hidden = 0;
  if (!o.keepCards && I) {
    const sv = new Float32Array(n).fill(-1); for (const i of spring.free) sv[i] = along(P(i));
    const keep = []; for (let t = 0; t < tc; t++) { const a = vi(t * 3), b = vi(t * 3 + 1), c = vi(t * 3 + 2); if (sv[a] >= 0 || sv[b] >= 0 || sv[c] >= 0) { hidden++; continue; } keep.push(a, b, c); }
    mesh.userData.strandsIndex0 = mesh.userData.strandsIndex0 || g.index; g.setIndex(keep); mesh.userData.strandsIndex1 = g.index;
  }
  // the shell's own edge pulled back a little, under the hairline's strands (hair-look.js: where its cut-out sits)
  const HU = mesh.material.userData.hairU; if (HU && o.shellCut != null) { mesh.userData.strandsCut0 = mesh.userData.strandsCut0 ?? HU.uHEdge.value.y; HU.uHEdge.value.y = o.shellCut; }
  if (HU && HU.uHFlat) HU.uHFlat.value = o.shellFlat;
  mesh.userData.strandsOn = true; mesh.userData.strandsShell = [o.shellCut, o.shellFlat];   // (body.setStrands switches back and forth)
  const stats = { ms: Math.round(performance.now() - t0), tail: tailCards, scalp: scalpCards, edge: edgeCards, verts: pos.length / 3, tris: idx.length / 3, hiddenTris: hidden, tailPts: tailPts.length, sMax: +sMax.toFixed(2), color: "#" + col.getHexString() };
  console.info("hair strands:", stats);
  return { ok: true, mesh: sm, tie: tieMesh, stats, U };
}
