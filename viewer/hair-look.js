// Hair shading for a hair mesh with a painted strand texture (MakeHuman hairstyles): the texture stays, the light on it
// changes.
// - Highlights along the strands (Kajiya-Kay, two lobes as in real hair: a white one shifted toward the root, a coloured,
//   broader one toward the tip), instead of a plastic highlight round the head. Which way the strands run is read off the
//   texture itself once, at load (a structure tensor of its brightness: strands are the direction it changes least), so
//   it works for any painted hairstyle, cap and loose locks alike.
// - Light through the hair: a softer falloff to the dark side, and a glow when the light is behind it.
// - Strand-shaped edges: where the painted hair thins out (the hairline, the ends of locks), the cut-out follows the
//   strands painted there, so the edge breaks into strands instead of a clean line.
import * as THREE from "three";

// the strands' direction in the texture: RG = cos, sin of twice the angle (so that a strand running either way, and the
// texture filtering, agree), B = how clear the direction is (0 where nothing is painted or the strokes cross)
export function strandFlowMap(image, size = 512) {
  const c = document.createElement("canvas"); c.width = c.height = size; const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(image, 0, 0, size, size); const d = g.getImageData(0, 0, size, size).data, n = size;
  const L = new Float32Array(n * n), A = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) { A[i] = d[i * 4 + 3] / 255; L[i] = (d[i * 4] * .3 + d[i * 4 + 1] * .59 + d[i * 4 + 2] * .11) / 255; }
  // only the strands: the brightness less its blurred copy (painted light and shade would steer the direction)
  const blur = (s, r) => { const t = new Float32Array(n * n);
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < n; y++) { let a = 0; for (let x = -r; x <= r; x++) a += s[y * n + Math.min(n - 1, Math.max(0, x))];
        for (let x = 0; x < n; x++) { t[y * n + x] = a / (2 * r + 1); a += s[y * n + Math.min(n - 1, x + r + 1)] - s[y * n + Math.max(0, x - r)]; } }
      for (let x = 0; x < n; x++) { let a = 0; for (let y = -r; y <= r; y++) a += t[Math.min(n - 1, Math.max(0, y)) * n + x];
        for (let y = 0; y < n; y++) { s[y * n + x] = a / (2 * r + 1); a += t[Math.min(n - 1, y + r + 1) * n + x] - t[Math.max(0, y - r) * n + x]; } } }
    return s; };
  const Lb = blur(L.slice(), Math.max(1, Math.round(n / 170))); for (let i = 0; i < n * n; i++) L[i] -= Lb[i];
  const at = (x, y) => L[Math.min(n - 1, Math.max(0, y)) * n + Math.min(n - 1, Math.max(0, x))];
  let xx = new Float32Array(n * n), xy = new Float32Array(n * n), yy = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) / 8;
    const gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) / 8;
    const i = y * n + x, w = A[i]; xx[i] = gx * gx * w; xy[i] = gx * gy * w; yy[i] = gy * gy * w; }
  // smoothed over a few strands' width
  const r = Math.max(3, Math.round(size / 40)); blur(xx, r); blur(xy, r); blur(yy, r);
  const out = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    const a = xx[i] - yy[i], b = 2 * xy[i], m = Math.hypot(a, b), tr = xx[i] + yy[i];
    // the brightness changes most at angle t (across the strands): the strands run at t + 90 deg, twice that is 2t + 180
    const c2 = m > 1e-12 ? -a / m : 1, s2 = m > 1e-12 ? -b / m : 0, coh = tr > 1e-9 ? m / tr : 0;
    out[i * 4] = Math.round((c2 * .5 + .5) * 255); out[i * 4 + 1] = Math.round((s2 * .5 + .5) * 255); out[i * 4 + 2] = Math.round(Math.min(1, coh) * 255); out[i * 4 + 3] = 255; }
  const t = new THREE.DataTexture(out, n, n, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}

// opt: spec (white highlight), spec2 (coloured one), shift / shift2 (toward root / tip, along the normal), shine / shine2
// (sharpness), wrap (light through the hair), back (glow against the light), edge (how much the cut-out follows the
// strands), cut (where it cuts), flow (a direction texture made beforehand, instead of reading it off the texture),
// soft: a blended, soft edge instead of a cut one; flat: how much the painted light and shade is evened out to the hair's average colour; combed: () => a world vector, the way the hair is combed where the texture does not say (the back of the head)
export function hairLook(mesh, { spec = .1, spec2 = .35, shift = -.03, shift2 = .05, shine = 100, shine2 = 30, wrap = .35, back = .25, edge = 2.2, cut = .32, flow = null, combed = null, soft = true, flat = 0, debug = 0 } = {}) {
  const M = mesh && mesh.material; if (!M || !M.map || !M.map.image) return { ok: false, error: "no hair texture" };
  let F = flow; try { F = F || M.userData.hairFlow || strandFlowMap(M.map.image); } catch (e) { return { ok: false, error: "texture not readable: " + e.message }; }
  M.userData.hairFlow = F;
  const U = M.userData.hairU || (M.userData.hairU = { uHFlow: { value: F }, uHSpec: { value: new THREE.Vector4() }, uHShine: { value: new THREE.Vector2() }, uHWrap: { value: new THREE.Vector2() }, uHEdge: { value: new THREE.Vector2() }, uHBack: { value: new THREE.Vector3(0, -1, 0) }, uHDbg: { value: 0 }, uHFlat: { value: 0 } });
  U.uHFlow.value = F; U.uHSpec.value.set(spec, spec2, shift, shift2); U.uHShine.value.set(shine, shine2); U.uHWrap.value.set(wrap, back); U.uHEdge.value.set(edge, cut); U.uHDbg.value = debug; U.uHFlat.value = flat;
  if (!M.userData.hairHooked) { M.userData.hairHooked = true; const prev = M.onBeforeCompile, prevKey = M.customProgramCacheKey ? M.customProgramCacheKey.bind(M) : () => "";
    M.onBeforeCompile = (sh, r) => { prev && prev.call(M, sh, r); Object.assign(sh.uniforms, U);
      sh.fragmentShader = "uniform sampler2D uHFlow; uniform vec4 uHSpec; uniform vec2 uHShine; uniform vec2 uHWrap; uniform vec2 uHEdge; uniform vec3 uHBack; uniform int uHDbg; uniform float uHFlat;\n" + sh.fragmentShader
        .replace("#include <lights_physical_pars_fragment>", `#include <lights_physical_pars_fragment>
vec3 hairT = vec3(0., 1., 0.); float hairJit = 0., hairGlint = 1.; vec3 hairCol = vec3(1.);
void RE_Direct_Hair( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  vec3 N = geometryNormal, L = directLight.direction, V = geometryViewDir, H = normalize(L + V);
  float nl = dot(N, L), w = uHWrap.x;
  // light through the hair: the dark side gets some of it, and more when the light is behind
  // (the glow only at the hair's rim, where it is thin: seen edge-on)
  float rim = 1. - saturate(abs(dot(N, V)) * 1.6);
  reflectedLight.directDiffuse += directLight.color * BRDF_Lambert(material.diffuseColor) * (saturate((nl + w) / (1. + w)) - saturate(nl) + uHWrap.y * pow(saturate(dot(-L, V)), 4.) * rim);
  // strands point root to tip (back and down, as hair is combed and falls), so that the two highlights shift the right way along every strand
  vec3 T = hairT * (dot(hairT, uHBack) < 0. ? -1. : 1.);
  vec3 T1 = normalize(T + N * (uHSpec.z + hairJit)), T2 = normalize(T + N * (uHSpec.w + hairJit));
  float d1 = dot(T1, H), d2 = dot(T2, H), att = smoothstep(-.1, .3, nl) * smoothstep(-.95, -.7, dot(L, V));   // (light straight behind: no half vector)
  float s1 = pow(sqrt(max(1. - d1 * d1, 0.)), uHShine.x), s2 = pow(sqrt(max(1. - d2 * d2, 0.)), uHShine.y);
  reflectedLight.directSpecular += directLight.color * att * hairGlint * RECIPROCAL_PI * (uHSpec.x * s1 + uHSpec.y * s2 * hairCol);   // (in the same units as three's diffuse: /pi)
}
#undef RE_Direct
#define RE_Direct RE_Direct_Hair`)
        .replace("#include <dithering_fragment>", "#include <dithering_fragment>\n  if (uHDbg == 1) gl_FragColor.rgb = hairT * .5 + .5; else if (uHDbg == 2) gl_FragColor.rgb = texture2D(uHFlow, vMapUv).rgb;")
        .replace("#include <map_fragment>", `#include <map_fragment>
  { // strand detail: the texture against a blurred copy of itself (its smaller mip)
    float hl = dot(diffuseColor.rgb, vec3(.3, .59, .11)), hb = dot(texture2D(map, vMapUv, 3.).rgb * diffuse, vec3(.3, .59, .11));
    hairJit = clamp((hl - hb) * 5., -.3, .3); hairCol = clamp(texture2D(map, vMapUv, 8.).rgb * diffuse * 1.5 + .02, 0., 1.);   // (the hair's overall colour: the painted lighter ends would step from lock to lock)
    hairGlint = .25 + 1.5 * smoothstep(-.04, .06, (hl - hb) / max(hb, .05));
    diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(map, vMapUv, 8.).rgb * diffuse, uHFlat);   // (painted light and shade evened out: under hair-strands.js only the base colour is wanted)   // (the painted strands catch the light, the gaps between them do not)
    // the cut-out along the strands: thin hair at the edge ends strand by strand
    float ha = diffuseColor.a; diffuseColor.a = smoothstep(uHEdge.y - .3, uHEdge.y + .35, ha + (hl - hb) / max(hb, .05) * uHEdge.x * ha * (1. - ha) * 4.); }`)
        .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
  { // the strand direction in view space: the texture's flow, carried by the surface's own texture frame
    vec4 fl = texture2D(uHFlow, vMapUv); float an = .5 * atan(fl.g * 2. - 1., fl.r * 2. - 1.); vec2 td = vec2(cos(an), sin(an));
    vec3 px = dFdx(-vViewPosition), py = dFdy(-vViewPosition); vec2 ux = dFdx(vMapUv), uy = dFdy(vMapUv);
    float det = ux.x * uy.y - ux.y * uy.x; det = abs(det) < 1e-12 ? 1e-12 : det;
    vec3 dU = (px * uy.y - py * ux.y) / det, dV = (py * ux.x - px * uy.x) / det;
    vec3 t = dU * td.x + dV * td.y; t -= normal * dot(normal, t);
    // where the texture does not say: back and down along the surface (combed back, falling)
    vec3 dn = uHBack - normal * dot(normal, uHBack);
    hairT = normalize(mix(normalize(dn + 1e-6), normalize(t + 1e-9), smoothstep(.15, .45, fl.b))); }`);
    };
    M.customProgramCacheKey = () => "hair|" + prevKey(); }
  // the strands carry the shine now: the round highlight soft and weak
  M.specularIntensity = .3; M.roughness = .65; M.envMapIntensity = .8;   // (a little of the soft round sheen stays: from afar it is what reads as hair colour)
  // a soft edge: the thin hair blended over the skin (alpha to coverage would cut it hard again), only the bare texture cut
  if (soft) { M.alphaToCoverage = false; M.transparent = true; M.alphaTest = .03; M.depthWrite = true; }
  M.needsUpdate = true;
  mesh.receiveShadow = true;   // the head shades the tail, locks shade each other
  const prevBR = mesh.userData.hairPrevBR !== undefined ? mesh.userData.hairPrevBR : (mesh.userData.hairPrevBR = mesh.onBeforeRender), w = new THREE.Vector3();
  mesh.onBeforeRender = function (r, sc, cam, ...rest) { prevBR && prevBR.call(this, r, sc, cam, ...rest);
    if (combed) w.copy(combed()); else w.set(0, -1, 0); U.uHBack.value.copy(w).transformDirection(cam.matrixWorldInverse); };
  return { ok: true };
}
