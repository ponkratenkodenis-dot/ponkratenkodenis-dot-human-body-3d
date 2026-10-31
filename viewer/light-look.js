// Light that fits the place, for any page: the reflections and the soft light from all round come from a sky made for
// the scene (its zenith, horizon and ground colours, a glow round the sun) instead of three's RoomEnvironment, a lit
// studio room; and ambient occlusion worked out once at load, per point of the skin and the clothes (under the chin,
// under the bust, in the ears, between the legs, the shirt's folds), from the character's own shape.
import * as THREE from "three";

// ---- a sky as an environment map (PMREM): directions over the horizon run from the horizon colour to the zenith's,
// with a glow toward the sun (the sun's disk itself is the scene's directional light, not doubled here); under it the
// ground, darker straight down. Colours are sRGB hex or THREE.Color; returns the texture (dispose the old one yourself)
export function skyEnvironment(renderer, { zenith = "#7fa6d6", horizon = "#f3dcc0", ground = "#c9a77f", sunDir = [.3, .6, -.7], sunColor = "#fff0dc", glow = .6, intensity = 1 } = {}) {
  const S = new THREE.Scene(), col = c => new THREE.Color(c).multiplyScalar(intensity);
  const U = { uZ: { value: col(zenith) }, uH: { value: col(horizon) }, uG: { value: col(ground) }, uS: { value: col(sunColor).multiplyScalar(glow) }, uD: { value: new THREE.Vector3(...sunDir).normalize() } };
  const M = new THREE.ShaderMaterial({ uniforms: U, side: THREE.BackSide, depthWrite: false,
    vertexShader: "varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
    fragmentShader: `uniform vec3 uZ, uH, uG, uS, uD; varying vec3 vD;
      void main() { vec3 d = normalize(vD); float y = d.y, s = max(dot(d, uD), 0.);
        vec3 sky = mix(uH, uZ, pow(max(y, 0.), .45)) + uS * (pow(s, 6.) * .6 + pow(s, 48.) * 1.5);
        vec3 gr = uG * mix(1., .55, pow(max(-y, 0.), .6)) + uS * pow(s, 6.) * .15;
        gl_FragColor = vec4(mix(gr, sky, smoothstep(-.04, .03, y)), 1.); }` });
  S.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), M));
  const pm = new THREE.PMREMGenerator(renderer), t = pm.fromScene(S, 0, .1, 50).texture; pm.dispose(); M.dispose(); return t;
}

// ---- ambient occlusion, per point. occluders and targets are meshes of one character in its bind pose (with its
// shape and face morphs as they are now). The occluders are drawn into a grid of cells (1 cm); from each target point
// rays go out over its hemisphere (cosine-weighted) and count what they meet within dist, nearer counting more.
// aAO (1 = open, 0 = closed in) is set on each target; returns stats
export function bindData(m) {
  const g = m.geometry, P = g.attributes.position, N = g.attributes.normal, n = P.count, X = new Float32Array(n * 3), Nn = new Float32Array(n * 3);
  const MP = g.morphAttributes.position || [], MN = g.morphAttributes.normal || [], I = m.morphTargetInfluences || [], rel = g.morphTargetsRelative;
  const act = []; for (let k = 0; k < I.length; k++) if (I[k] && MP[k]) act.push(k);
  const B = m.isSkinnedMesh ? m.bindMatrix : m.matrixWorld, NB = new THREE.Matrix3().getNormalMatrix(B), v = new THREE.Vector3(), w = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(P, i); if (N) w.fromBufferAttribute(N, i); else w.set(0, 0, 0);
    for (const k of act) { const a = MP[k], f = I[k], b = MN[k];
      if (rel) { v.x += a.getX(i) * f; v.y += a.getY(i) * f; v.z += a.getZ(i) * f; } else { v.x += (a.getX(i) - v.x) * f; v.y += (a.getY(i) - v.y) * f; v.z += (a.getZ(i) - v.z) * f; }
      if (b && N) { w.x += b.getX(i) * f; w.y += b.getY(i) * f; w.z += b.getZ(i) * f; } }
    v.applyMatrix4(B); w.applyMatrix3(NB).normalize(); X.set([v.x, v.y, v.z], i * 3); Nn.set([w.x, w.y, w.z], i * 3);
  }
  return { X, N: Nn, n, index: g.index ? g.index.array : null };
}
export function bakeAO(occluders, targets, { cell = .01, rays = 16, dist = .14, strength = 1, soft = [] } = {}) {
  const t0 = performance.now(), D = new Map(); for (const m of new Set([...occluders, ...targets])) D.set(m, bindData(m));
  const lo = new THREE.Vector3(1e9, 1e9, 1e9), hi = new THREE.Vector3(-1e9, -1e9, -1e9);
  for (const m of occluders) { const { X, n } = D.get(m), q = new THREE.Vector3(); for (let i = 0; i < n; i++) { q.fromArray(X, i * 3); lo.min(q); hi.max(q); } }
  lo.subScalar(dist + cell); hi.addScalar(dist + cell); const t1 = performance.now();
  const nx = Math.ceil((hi.x - lo.x) / cell), ny = Math.ceil((hi.y - lo.y) / cell), nz = Math.ceil((hi.z - lo.z) / cell), G = new Uint8Array(nx * ny * nz);
  const at = (x, y, z) => { const i = Math.floor((x - lo.x) / cell), j = Math.floor((y - lo.y) / cell), k = Math.floor((z - lo.z) / cell); return i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? -1 : (k * ny + j) * nx + i; };
  // the occluders' surfaces into the grid (soft ones, hair cards, count half)
  for (const m of occluders) { const { X, n, index } = D.get(m), val = soft.includes(m) ? 1 : 2, tc = index ? index.length : n;
    for (let t = 0; t < tc; t += 3) { const a = (index ? index[t] : t) * 3, b = (index ? index[t + 1] : t + 1) * 3, c = (index ? index[t + 2] : t + 2) * 3;
      const e = Math.max(Math.hypot(X[b] - X[a], X[b + 1] - X[a + 1], X[b + 2] - X[a + 2]), Math.hypot(X[c] - X[a], X[c + 1] - X[a + 1], X[c + 2] - X[a + 2]), Math.hypot(X[c] - X[b], X[c + 1] - X[b + 1], X[c + 2] - X[b + 2]));
      const s = Math.max(1, Math.ceil(e / (cell * .5)));
      for (let i = 0; i <= s; i++) for (let j = 0; j <= s - i; j++) { const u = i / s, w = j / s;
        const q = at(X[a] + (X[b] - X[a]) * u + (X[c] - X[a]) * w, X[a + 1] + (X[b + 1] - X[a + 1]) * u + (X[c + 1] - X[a + 1]) * w, X[a + 2] + (X[b + 2] - X[a + 2]) * u + (X[c + 2] - X[a + 2]) * w);
        if (q >= 0 && G[q] < val) G[q] = val; } } }
  const t2 = performance.now();
  // ray directions over a hemisphere about +z, cosine-weighted (a Fibonacci spiral)
  const R = []; for (let k = 0; k < rays; k++) { const r = Math.sqrt((k + .5) / rays), ph = k * 2.39996; R.push([r * Math.cos(ph), r * Math.sin(ph), Math.sqrt(1 - r * r)]); }
  const step = cell * .8, ns = Math.ceil(dist / step), st = {};
  // (in grid units, integer cells: the inner loop has no calls)
  const ic = 1 / cell, sc = step * ic, RA = new Float32Array(R.flat()), NR = R.length;
  for (const m of targets) { const { X, N, n, index } = D.get(m);
    // the seams joined by position: each point once
    const key = new Map(), W = new Int32Array(n); let c = 0;
    for (let i = 0; i < n; i++) { const k = Math.round(X[i * 3] * 1e4) * 1e10 + Math.round(X[i * 3 + 1] * 1e4) * 1e5 + Math.round(X[i * 3 + 2] * 1e4); let j = key.get(k); if (j == null) key.set(k, j = c++); W[i] = j; }
    const UP = new Float32Array(c * 3), UN = new Float32Array(c * 3);
    for (let i = 0; i < n; i++) { const j = W[i]; for (let a = 0; a < 3; a++) { UP[j * 3 + a] = X[i * 3 + a]; UN[j * 3 + a] += N[i * 3 + a]; } }
    const S0 = new Float32Array(c);
    for (let j = 0; j < c; j++) {
      let nx0 = UN[j * 3], ny0 = UN[j * 3 + 1], nz0 = UN[j * 3 + 2]; const l = Math.hypot(nx0, ny0, nz0); if (l < 1e-6) continue; nx0 /= l; ny0 /= l; nz0 /= l;
      let tx = 0, ty = -nz0, tz = ny0; if (Math.abs(nx0) >= .9) { tx = nz0; ty = 0; tz = -nx0; }                 // (1,0,0) or (0,1,0) x n
      const tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl; const bx = ny0 * tz - nz0 * ty, by = nz0 * tx - nx0 * tz, bz = nx0 * ty - ny0 * tx;
      const ox = (UP[j * 3] + nx0 * cell * 1.5 - lo.x) * ic, oy = (UP[j * 3 + 1] + ny0 * cell * 1.5 - lo.y) * ic, oz = (UP[j * 3 + 2] + nz0 * cell * 1.5 - lo.z) * ic; let occ = 0;
      for (let r = 0; r < NR; r++) { const a = RA[r * 3], b = RA[r * 3 + 1], e = RA[r * 3 + 2];
        const dx = (tx * a + bx * b + nx0 * e) * sc, dy = (ty * a + by * b + ny0 * e) * sc, dz = (tz * a + bz * b + nz0 * e) * sc;
        let px = ox, py = oy, pz = oz;
        for (let s = 1; s <= ns; s++) { px += dx; py += dy; pz += dz;
          if (px < 0 || py < 0 || pz < 0 || px >= nx || py >= ny || pz >= nz) break;
          const g = G[((pz | 0) * ny + (py | 0)) * nx + (px | 0)]; if (g) { occ += (g === 2 ? 1 : .5) * (1 - s / ns * .7); break; } } }
      S0[j] = occ / NR; }
    // smoothed once over the points' neighbours
    const S1 = Float32Array.from(S0), C1 = new Float32Array(c).fill(1), tc = index ? index.length : n;
    for (let t = 0; t < tc; t += 3) { const v = [0, 1, 2].map(q => W[index ? index[t + q] : t + q]); for (const p of v) for (const q of v) if (p !== q) { S1[p] += S0[q] * .5; C1[p] += .5; } }
    const A = new Float32Array(n); let sum = 0, dark = 0;
    for (let i = 0; i < n; i++) { const o = S1[W[i]] / C1[W[i]]; A[i] = 1 - Math.min(1, o * strength); sum += A[i]; if (A[i] < .6) dark++; }
    m.geometry.setAttribute("aAO", new THREE.BufferAttribute(A, 1)); st[m.name] = { points: n, mean: +(sum / n).toFixed(3), dark };
  }
  st.grid = [nx, ny, nz]; st.ms = Math.round(performance.now() - t0); st.phases = [Math.round(t1 - t0), Math.round(t2 - t1), Math.round(performance.now() - t2)]; return st;
}

// the occlusion in a material: the light from all round (sky, ground, reflections) is taken by aAO, the direct light
// a little (direct, 0..1: shadows finer than the shadow map's cells). Every mesh drawn with it needs aAO (see ensureAO)
export function aoShader(mat, { direct = .25, specular = .8 } = {}) {
  const U = mat.userData.aoU || (mat.userData.aoU = { uAoD: { value: 0 }, uAoS: { value: 0 } }); U.uAoD.value = direct; U.uAoS.value = specular;
  if (mat.userData.aoHooked) return U; mat.userData.aoHooked = true;
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => "";
  mat.onBeforeCompile = (sh, r) => { prev && prev.call(mat, sh, r); Object.assign(sh.uniforms, U);
    sh.vertexShader = "attribute float aAO; varying float vAO;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n vAO = aAO;");
    sh.fragmentShader = "uniform float uAoD; uniform float uAoS; varying float vAO;\n" + sh.fragmentShader.replace("#include <aomap_fragment>", `#include <aomap_fragment>
 reflectedLight.indirectDiffuse *= vAO; reflectedLight.indirectSpecular *= mix(1., vAO, uAoS); reflectedLight.directDiffuse *= mix(1., vAO, uAoD);`); };
  mat.customProgramCacheKey = () => "ao|" + prevKey(); mat.needsUpdate = true; return U;
}
// meshes drawn with a material that has the occlusion but no aAO of their own (a wrapped garment's copy takes its
// garment's, by name; anything else is left open, 1)
export function ensureAO(root) {
  const byName = new Map(); root.traverse(o => { if (o.isMesh && o.geometry.attributes.aAO) byName.set(o.name, o); });
  let n = 0; root.traverse(o => { if (!o.isMesh || o.geometry.attributes.aAO) return; const ms = Array.isArray(o.material) ? o.material : [o.material]; if (!ms.some(m => m && m.userData.aoHooked)) return;
    const src = byName.get(o.name.replace(/_wrap$/, "")), c = o.geometry.attributes.position.count;
    o.geometry.setAttribute("aAO", src && src.geometry.attributes.aAO.count === c ? src.geometry.attributes.aAO : new THREE.BufferAttribute(new Float32Array(c).fill(1), 1)); n++; });
  return n;
}
