// MuscleDrive: bones -> muscles -> skin.
// Each muscle is tied to the bones at its two ends (origin and insertion, found from the skeleton next to each end),
// so it really lengthens and shortens as the joints move. Its volume is kept: a shortened muscle thickens, a
// stretched one thins (cross-section ~ 1/length). The skin and the clothes lie on the muscles: every skin vertex knows
// the muscles under it and rises with them. Everything runs in the vertex shaders; per frame only one number per
// muscle is updated (a 1-D float texture shared by the skin, and a uniform per muscle).
import * as THREE from "three";

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class MuscleDrive {
  constructor(body, opt = {}) {
    this.b = body; this.enabled = true; this.skinOn = true; this.tension = false;
    this.opt = Object.assign({ endFrac: .14, attachR: .045, skinR: .03, gain: 1.0 }, opt);
  }

  /* ---------------- one-time analysis at load ---------------- */
  setup() {
    const b = this.b, v = new THREE.Vector3();
    // spatial hash of the skeleton (rest pose, world space) -> which bone each point moves with
    const H = new Map(), C = .02, key = (x, y, z) => `${Math.floor(x / C)},${Math.floor(y / C)},${Math.floor(z / C)}`;
    for (const m of b.layerMeshes.skeleton) {
      if (!m.isSkinnedMesh || /ligament|disc|Nucleus/i.test(m.userData.part)) continue;
      const p = m.geometry.attributes.position, si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
      const step = Math.max(1, Math.floor(p.count / 300));
      for (let i = 0; i < p.count; i += step) {
        v.fromBufferAttribute(p, i).applyMatrix4(m.bindMatrix);
        let best = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
        const kk = key(v.x, v.y, v.z); if (!H.has(kk)) H.set(kk, []);
        H.get(kk).push([v.x, v.y, v.z, m.skeleton.bones[best], m.userData.part]);
      }
    }
    const nearestBone = (p, R) => {
      let best = null, bd = R * R; const r = Math.ceil(R / C), cx = Math.floor(p.x / C), cy = Math.floor(p.y / C), cz = Math.floor(p.z / C);
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) {
        const L = H.get(`${cx + i},${cy + j},${cz + k}`); if (!L) continue;
        for (const q of L) { const d = (q[0] - p.x) ** 2 + (q[1] - p.y) ** 2 + (q[2] - p.z) ** 2; if (d < bd) { bd = d; best = q; } }
      }
      return best;
    };

    this.M = [];                                      // muscles
    const MH = new Map();                             // hash of muscle surface points -> muscle index (for the skin)
    for (const m of b.layerMeshes.muscles) {
      if (!m.isSkinnedMesh) continue;
      const g = m.geometry, p = g.attributes.position, n = p.count, P = new Float32Array(n * 3);
      const mean = new THREE.Vector3();
      for (let i = 0; i < n; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m.bindMatrix); P.set([v.x, v.y, v.z], i * 3); mean.add(v); }
      mean.multiplyScalar(1 / n);
      // principal axis (power iteration on the covariance)
      let cxx = 0, cxy = 0, cxz = 0, cyy = 0, cyz = 0, czz = 0;
      for (let i = 0; i < n; i++) { const x = P[i * 3] - mean.x, y = P[i * 3 + 1] - mean.y, z = P[i * 3 + 2] - mean.z; cxx += x * x; cxy += x * y; cxz += x * z; cyy += y * y; cyz += y * z; czz += z * z; }
      const u = new THREE.Vector3(1, 1, 1).normalize();
      for (let it = 0; it < 24; it++) { const x = cxx * u.x + cxy * u.y + cxz * u.z, y = cxy * u.x + cyy * u.y + cyz * u.z, z = cxz * u.x + cyz * u.y + czz * u.z; u.set(x, y, z).normalize(); }
      const t = new Float32Array(n), rad = new Float32Array(n); let tmin = 1e9, tmax = -1e9;
      for (let i = 0; i < n; i++) { const x = P[i * 3] - mean.x, y = P[i * 3 + 1] - mean.y, z = P[i * 3 + 2] - mean.z, tt = x * u.x + y * u.y + z * u.z; t[i] = tt; if (tt < tmin) tmin = tt; if (tt > tmax) tmax = tt;
        rad[i] = Math.hypot(x - u.x * tt, y - u.y * tt, z - u.z * tt); }
      const len = tmax - tmin || 1e-6, ends = [new THREE.Vector3(), new THREE.Vector3()], cnt = [0, 0], ef = this.opt.endFrac;
      for (let i = 0; i < n; i++) { const tn = (t[i] - tmin) / len; v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); if (tn < ef) { ends[0].add(v); cnt[0]++; } else if (tn > 1 - ef) { ends[1].add(v); cnt[1]++; } }
      ends[0].multiplyScalar(1 / Math.max(1, cnt[0])); ends[1].multiplyScalar(1 / Math.max(1, cnt[1]));
      const att = ends.map(e => nearestBone(e, this.opt.attachR));
      const sorted = Array.from(rad).sort((a, c) => a - c), R = sorted[Math.floor(n * .6)] || .01;
      g.setAttribute("aRad", new THREE.BufferAttribute(rad, 1));
      const passive = /bursa|fascia|aponeurosis|retinaculum|sheath|septum|Linea alba|tract|ligament|^Tendon|tendon$/i.test(m.userData.part);   // not contractile: no bulge, no report
      const rec = { mesh: m, R, len, L0: 0, bulge: 0, ratio: 1, ends, att, idx: this.M.length, attached: !passive && !!(att[0] && att[1] && att[0][3] !== att[1][3]) };
      if (rec.attached) {
        rec.loc = att.map((a, k) => { const bone = a[3], bi = m.skeleton.bones.indexOf(bone); const inv = bi >= 0 ? m.skeleton.boneInverses[bi] : new THREE.Matrix4().copy(bone.matrixWorld).invert(); return { bone, p: ends[k].clone().applyMatrix4(inv) }; });
        rec.L0 = ends[0].distanceTo(ends[1]);
        this._pinEnds(m, t, tmin, len, att.map(a => a[3]));                           // tendons go with their bones
      }
      this._muscleShader(m, rec);
      this.M.push(rec);
      const step = Math.max(1, Math.floor(n / 220));
      for (let i = 0; i < n; i += step) { const kk = key(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); if (!MH.has(kk)) MH.set(kk, []); MH.get(kk).push([P[i * 3], P[i * 3 + 1], P[i * 3 + 2], rec.idx]); }
    }
    // one float per muscle: how far its surface moves out (metres), read by the skin shader
    const W = 1024; this.tex = new THREE.DataTexture(new Float32Array(W), W, 1, THREE.RedFormat, THREE.FloatType); this.tex.needsUpdate = true;
    this.texW = W;
    // skin and clothes: the two nearest muscles under each vertex
    for (const m of [...b.layerMeshes.skin.filter(x => x.name === "Body"), ...b.layerMeshes.clothes]) this._coupleSkin(m, MH, C);
    this.stats = { muscles: this.M.length, attached: this.M.filter(r => r.attached).length };
    return this.stats;
  }

  // blend the weights at each end of the muscle toward the bone it is attached to
  _pinEnds(m, t, tmin, len, bones) {
    const g = m.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, n = si.count, bi = bones.map(bn => m.skeleton.bones.indexOf(bn)), ef = this.opt.endFrac;
    if (bi.some(x => x < 0)) return;
    for (let i = 0; i < n; i++) {
      const tn = (t[i] - tmin) / len, w0 = 1 - sstep(0, ef * 1.6, tn), w1 = sstep(1 - ef * 1.6, 1, tn), we = Math.max(w0, w1); if (we <= 0) continue;
      const tgt = w0 >= w1 ? bi[0] : bi[1], acc = new Map();
      for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k) * (1 - we); if (w > 0) acc.set(si.getComponent(i, k), (acc.get(si.getComponent(i, k)) || 0) + w); }
      acc.set(tgt, (acc.get(tgt) || 0) + we);
      const top = [...acc.entries()].sort((a, c) => c[1] - a[1]).slice(0, 4), s = top.reduce((a, c) => a + c[1], 0);
      for (let k = 0; k < 4; k++) { si.setComponent(i, k, top[k] ? top[k][0] : 0); sw.setComponent(i, k, top[k] ? top[k][1] / s : 0); }
    }
    si.needsUpdate = sw.needsUpdate = true;
  }

  _muscleShader(m, rec) {
    const mat = m.material; rec.u = { uBulge: { value: 0 }, uTension: { value: 0 }, uTensionOn: { value: 0 } };
    const hook = mm => {
      mm.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, rec.u);
        sh.vertexShader = "attribute float aRad; uniform float uBulge;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n transformed += objectNormal * aRad * uBulge;");
        sh.fragmentShader = "uniform float uTension; uniform float uTensionOn;\n" + sh.fragmentShader.replace("#include <color_fragment>",
          "#include <color_fragment>\n if (uTensionOn > .5) { vec3 base = vec3(.33,.024,.016); vec3 c = uTension > 0. ? mix(base, vec3(1.,.28,.0), clamp(uTension*4.,0.,1.)) : mix(base, vec3(.04,.16,.75), clamp(-uTension*4.,0.,1.)); diffuseColor.rgb = c; }");
      };
      mm.customProgramCacheKey = () => "muscle-drive";
    };
    hook(mat); rec.hook = hook;
  }

  _coupleSkin(m, MH, C) {
    const g = m.geometry, p = g.attributes.position, n = p.count, v = new THREE.Vector3(), R = this.opt.skinR;
    const mi = new Float32Array(n * 2), mw = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.bindMatrix);
      const cx = Math.floor(v.x / C), cy = Math.floor(v.y / C), cz = Math.floor(v.z / C), best = new Map(), r = Math.ceil(R / C);
      for (let a = -r; a <= r; a++) for (let b2 = -r; b2 <= r; b2++) for (let c = -r; c <= r; c++) {
        const L = MH.get(`${cx + a},${cy + b2},${cz + c}`); if (!L) continue;
        for (const q of L) { const d = Math.hypot(q[0] - v.x, q[1] - v.y, q[2] - v.z); if (d < R && (!best.has(q[3]) || d < best.get(q[3]))) best.set(q[3], d); }
      }
      const top = [...best.entries()].sort((a, c) => a[1] - c[1]).slice(0, 2);
      for (let k = 0; k < 2; k++) if (top[k]) { mi[i * 2 + k] = top[k][0]; mw[i * 2 + k] = Math.max(0, 1 - top[k][1] / R) ** 1.5; }
      const s = mw[i * 2] + mw[i * 2 + 1]; if (s > 1) { mw[i * 2] /= s; mw[i * 2 + 1] /= s; }
    }
    g.setAttribute("aMi", new THREE.BufferAttribute(mi, 2)); g.setAttribute("aMw", new THREE.BufferAttribute(mw, 2));
    const mat = m.material, prev = mat.onBeforeCompile, self = this;
    mat.userData.uMus = { uMusTex: { value: this.tex }, uMusW: { value: this.texW }, uSkinOn: { value: 1 } };
    mat.onBeforeCompile = (sh, r) => {
      prev && prev.call(mat, sh, r);
      Object.assign(sh.uniforms, mat.userData.uMus);
      sh.vertexShader = "attribute vec2 aMi; attribute vec2 aMw; uniform sampler2D uMusTex; uniform float uMusW; uniform float uSkinOn;\n" +
        sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n { float d = aMw.x * texelFetch(uMusTex, ivec2(int(aMi.x), 0), 0).r + aMw.y * texelFetch(uMusTex, ivec2(int(aMi.y), 0), 0).r;\n   transformed += objectNormal * d * uSkinOn; }");
    };
    mat.customProgramCacheKey = () => "skin-on-muscle-" + (mat.vertexColors ? 1 : 0);
    mat.needsUpdate = true;
  }

  /* ---------------- per frame ---------------- */
  update(dt) {
    if (!this.M) return;
    const a = new THREE.Vector3(), c = new THREE.Vector3(), data = this.tex.image.data, k = 1 - Math.exp(-dt * 12), on = this.enabled;
    for (const r of this.M) {
      let target = 0, tension = 0;
      if (on && r.attached) {
        a.copy(r.loc[0].p).applyMatrix4(r.loc[0].bone.matrixWorld); c.copy(r.loc[1].p).applyMatrix4(r.loc[1].bone.matrixWorld);
        const ratio = a.distanceTo(c) / r.L0;
        r.ratio = ratio;
        target = Math.min(.45, Math.max(-.25, (1 / Math.sqrt(ratio) - 1) * this.opt.gain));   // constant volume: radius ~ 1/sqrt(length)
        tension = 1 - ratio;                                                                       // + shortened, - stretched
      }
      r.bulge += (target - r.bulge) * k;
      r.u.uBulge.value = r.bulge; r.u.uTension.value = tension; r.u.uTensionOn.value = this.tension ? 1 : 0;
      if (r.idx < this.texW) data[r.idx] = this.skinOn && on ? r.R * r.bulge : 0;
    }
    this.tex.needsUpdate = true;
  }
  // re-attach the shader hook when a highlight swaps in a cloned material
  hookClone(mesh, mat) { const r = this.M && this.M.find(x => x.mesh === mesh); if (r) r.hook(mat); }
  report(limit = 12) {
    return this.M.filter(r => r.attached).map(r => ({ name: r.mesh.userData.part, change: Math.round((r.ratio - 1) * 100) }))
      .sort((x, y) => Math.abs(y.change) - Math.abs(x.change)).slice(0, limit);
  }
}
