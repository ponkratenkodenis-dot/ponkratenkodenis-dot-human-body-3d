// Clothes that ride on the deformed skin itself (a "wrap"), not on their own copy of the skin's weights.
// A skinned garment whose vertices sit between the skin's vertices (a cut, subdivided, lifted shell) blends bone
// transforms at points the skin never blends at: where the bones turn a lot against each other (the base of the neck
// with a raised arm) it then drifts off the skin by millimetres and folds. A wrapped garment instead keeps, for each of
// its vertices, the skin triangle under it, the spot in that triangle and its offset in the triangle's own frame; each
// frame the skin under it is deformed on the CPU exactly as the GPU does it (shape morphs, then dual quaternion skinning,
// see dq-skinning.js), and the garment is laid on it. It follows everything the skin does: soft-tissue bones, the
// thigh and belly springs, poses, and stays over it everywhere.
//   const w = new SkinWrap(body, garmentMesh); body.wraps.push(w)   (body.js updates every wrap after the springs)
import * as THREE from "three";

export class SkinWrap {
  constructor(body, mesh, { reach = .12 } = {}) {
    this.b = body; this.src = mesh; this.ok = false;
    const skin = body.parts.get("Body"); if (!skin || !skin.isSkinnedMesh || !mesh.isSkinnedMesh) return;
    this.skin = skin;
    const sg = skin.geometry, idx = sg.index; if (!idx) return;
    const SP = this._skinRest();                                     // the skin at rest, as it stands (shape morphs), bind frame
    // the garment at rest, bind frame (its own morphs as they stand)
    const g = mesh.geometry, P = g.attributes.position, n = P.count, v = new THREE.Vector3(), C = new Float32Array(n * 3);
    const mi = mesh.morphTargetInfluences || [], ma = g.morphAttributes.position || [];
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(P, i); for (let k = 0; k < ma.length; k++) if (mi[k]) v.addScaledVector(new THREE.Vector3().fromBufferAttribute(ma[k], i), mi[k]); v.applyMatrix4(mesh.bindMatrix); C.set([v.x, v.y, v.z], i * 3); }
    // the skin's triangles in a hash of 3 cm cells
    const T = idx.array, nt = T.length / 3, cell = .03, H = new Map(), key = (a, b, c) => a + "," + b + "," + c;
    for (let t = 0; t < nt; t++) {
      let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
      for (let k = 0; k < 3; k++) { const j = T[t * 3 + k] * 3; x0 = Math.min(x0, SP[j]); x1 = Math.max(x1, SP[j]); y0 = Math.min(y0, SP[j + 1]); y1 = Math.max(y1, SP[j + 1]); z0 = Math.min(z0, SP[j + 2]); z1 = Math.max(z1, SP[j + 2]); }
      for (let a = Math.floor(x0 / cell); a <= Math.floor(x1 / cell); a++) for (let b = Math.floor(y0 / cell); b <= Math.floor(y1 / cell); b++) for (let c = Math.floor(z0 / cell); c <= Math.floor(z1 / cell); c++) { const k = key(a, b, c); (H.get(k) || H.set(k, []).get(k)).push(t); }
    }
    const A = new THREE.Vector3(), B = new THREE.Vector3(), Cc = new THREE.Vector3(), q = new THREE.Vector3(), cp = new THREE.Vector3(), tri = new THREE.Triangle(), bary = new THREE.Vector3();
    const TV = new Int32Array(n * 3), BW = new Float32Array(n * 3), OF = new Float32Array(n * 3), NF = new Float32Array(n * 3); let far = 0;
    const GN = g.attributes.normal, nm3 = new THREE.Matrix3().getNormalMatrix(mesh.bindMatrix), gn = new THREE.Vector3();
    const frame = (a, b, c, t1, t2, nn) => { t1.subVectors(b, a).normalize(); nn.subVectors(b, a).cross(cp.subVectors(c, a)).normalize(); t2.crossVectors(nn, t1); };
    const t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), nn = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      q.set(C[i * 3], C[i * 3 + 1], C[i * 3 + 2]); let best = 1e9, bt = -1; const bp = new THREE.Vector3();
      for (let r = 1; r <= Math.ceil(reach / cell) && bt < 0; r++) {                // grow the search until something is found
        const cx = Math.floor(q.x / cell), cy = Math.floor(q.y / cell), cz = Math.floor(q.z / cell), seen = new Set();
        for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) for (const t of H.get(key(cx + a, cy + b, cz + c)) || []) {
          if (seen.has(t)) continue; seen.add(t);
          A.fromArray(SP, T[t * 3] * 3); B.fromArray(SP, T[t * 3 + 1] * 3); Cc.fromArray(SP, T[t * 3 + 2] * 3); tri.set(A, B, Cc); tri.closestPointToPoint(q, cp);
          const d = cp.distanceTo(q); if (d < best) { best = d; bt = t; bp.copy(cp); }
        }
      }
      if (bt < 0) { far++; bt = 0; }
      A.fromArray(SP, T[bt * 3] * 3); B.fromArray(SP, T[bt * 3 + 1] * 3); Cc.fromArray(SP, T[bt * 3 + 2] * 3); tri.set(A, B, Cc);
      tri.closestPointToPoint(q, bp); tri.getBarycoord(bp, bary); frame(A, B, Cc, t1, t2, nn);
      const o = q.clone().sub(bp);
      TV.set([T[bt * 3], T[bt * 3 + 1], T[bt * 3 + 2]], i * 3); BW.set([bary.x, bary.y, bary.z], i * 3); OF.set([o.dot(t1), o.dot(t2), o.dot(nn)], i * 3);
      if (GN) { gn.fromBufferAttribute(GN, i).applyMatrix3(nm3).normalize(); NF.set([gn.dot(t1), gn.dot(t2), gn.dot(nn)], i * 3); } else NF[i * 3 + 2] = 1;   // its normal, carried the same way
    }
    // the skin vertices the garment needs
    const used = [...new Set(TV)]; this.U = Int32Array.from(used); const slot = new Map(used.map((s, k) => [s, k])); this.TVs = TV.map(s => slot.get(s));
    this.BW = BW; this.OF = OF; this.NF = NF; this.n = n; this.UP = new Float32Array(used.length * 3);
    // only the bones those skin vertices hang on
    const ssi = sg.attributes.skinIndex, ssw = sg.attributes.skinWeight, ub = new Set();
    for (const i of used) for (let j = 0; j < 4; j++) if (ssw.getComponent(i, j)) ub.add(ssi.getComponent(i, j));
    this.UB = Int32Array.from(ub);
    // the shown mesh: the garment's triangles and attributes, positions written each frame (world)
    const G = new THREE.BufferGeometry(); G.setIndex(g.index); for (const nm of ["uv", "uv1"]) if (g.attributes[nm]) G.setAttribute(nm, g.attributes[nm].clone());
    this.pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3); this.pos.setUsage(THREE.DynamicDrawUsage); G.setAttribute("position", this.pos);
    this.nor = new THREE.BufferAttribute(new Float32Array(n * 3), 3); this.nor.setUsage(THREE.DynamicDrawUsage); G.setAttribute("normal", this.nor);
    this.mesh = new THREE.Mesh(G, mesh.material); this.mesh.name = mesh.name + "_wrap"; this.mesh.castShadow = true; this.mesh.frustumCulled = false; this.mesh.matrixAutoUpdate = false;
    // the garment's own soft bones (a panel or sleeve on a spring, added with body.addSoftTissue(…, { part })): their
    // swing is added on top of the skin's motion, by the garment's weights for them
    const own = new Set(skin.skeleton.bones.map(b => b.name)), gsi = g.attributes.skinIndex, gsw = g.attributes.skinWeight; this.extra = [];
    mesh.skeleton.bones.forEach((B, bi) => { if (own.has(B.name) || !B.userData.restPos) return; const w = new Float32Array(n); let any = 0;
      for (let i = 0; i < n; i++) for (let j = 0; j < 4; j++) if (gsi.getComponent(i, j) === bi) { w[i] += gsw.getComponent(i, j); any++; }
      if (!any) return; const I = []; for (let i = 0; i < n; i++) if (w[i] > 1e-4) I.push(i);
      this.extra.push({ B, I: Int32Array.from(I), w: Float32Array.from(I, i => w[i]) }); });
    body.scene.add(this.mesh); mesh.userData.wrapProxy = this.mesh; this.ok = true; this.far = far; this._restKey = "";
    this.update();
  }
  // the skin's rest positions with the shape morphs as they stand (bind frame), for every vertex (or the used ones)
  _skinRest(only) {
    const skin = this.skin, g = skin.geometry, P = g.attributes.position, ma = g.morphAttributes.position || [], mi = skin.morphTargetInfluences || [], rel = g.morphTargetsRelative;
    const list = only || null, n = list ? list.length : P.count, out = new Float32Array(n * 3), v = new THREE.Vector3(), d = new THREE.Vector3();
    for (let k = 0; k < n; k++) { const i = list ? list[k] : k; v.fromBufferAttribute(P, i);
      for (let m = 0; m < ma.length; m++) if (mi[m]) { d.fromBufferAttribute(ma[m], i); if (rel) v.addScaledVector(d, mi[m]); else v.lerp(d, mi[m]); }
      v.applyMatrix4(skin.bindMatrix); out.set([v.x, v.y, v.z], k * 3); }
    return out;
  }
  update() {
    if (!this.ok) return; const skin = this.skin, sk = skin.skeleton;
    // off (w.off = true, e.g. on a slow device): the garment is skinned on its own again, at no CPU cost
    if (this.off) { this.mesh.visible = false; this.src.visible = !!this.src.userData.wrapShown; return; }
    this.src.visible = false; this.mesh.visible = !!this.src.userData.wrapShown;
    if (!this.mesh.visible) return;
    // rest positions of the used skin vertices again when the shape changed (the face's morphs do not reach the clothes)
    const key = (skin.morphTargetInfluences || []).slice(skin.userData.shapeBase || 0).map(x => x.toFixed(3)).join(",");
    if (key !== this._restKey) { this._restKey = key; this.R = this._skinRest(this.U); }
    sk.update();                                                                      // bone matrices as they are now
    const BM = sk.boneMatrices, nb = sk.bones.length, DQ = this._dq && this._dq.length === nb * 8 ? this._dq : (this._dq = new Float32Array(nb * 8)), SC = this._sc && this._sc.length === nb ? this._sc : (this._sc = new Float32Array(nb));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), t = new THREE.Vector3(), s = new THREE.Vector3();
    for (const b of this.UB) {                                                        // each bone used: a unit dual quaternion and its scale
      m.fromArray(BM, b * 16); m.decompose(t, q, s); const o = b * 8;
      DQ[o] = q.x; DQ[o + 1] = q.y; DQ[o + 2] = q.z; DQ[o + 3] = q.w;
      DQ[o + 4] = .5 * (t.x * q.w + t.y * q.z - t.z * q.y); DQ[o + 5] = .5 * (-t.x * q.z + t.y * q.w + t.z * q.x); DQ[o + 6] = .5 * (t.x * q.y - t.y * q.x + t.z * q.w); DQ[o + 7] = -.5 * (t.x * q.x + t.y * q.y + t.z * q.z);
      SC[b] = s.x;
    }
    const si = skin.geometry.attributes.skinIndex, sw = skin.geometry.attributes.skinWeight, U = this.U, R = this.R, UP = this.UP;
    for (let k = 0; k < U.length; k++) {                                              // dual quaternion skinning, as the shader does it
      const i = U[k]; let r0 = 0, r1 = 0, r2 = 0, r3 = 0, d0 = 0, d1 = 0, d2 = 0, d3 = 0, sc = 0, wt = 0, f0 = -1;
      for (let j = 0; j < 4; j++) { const w = sw.getComponent(i, j); if (!w) continue; const o = si.getComponent(i, j) * 8;
        if (f0 < 0) f0 = o; const sg = DQ[o] * DQ[f0] + DQ[o + 1] * DQ[f0 + 1] + DQ[o + 2] * DQ[f0 + 2] + DQ[o + 3] * DQ[f0 + 3] < 0 ? -w : w;
        r0 += DQ[o] * sg; r1 += DQ[o + 1] * sg; r2 += DQ[o + 2] * sg; r3 += DQ[o + 3] * sg; d0 += DQ[o + 4] * sg; d1 += DQ[o + 5] * sg; d2 += DQ[o + 6] * sg; d3 += DQ[o + 7] * sg; sc += SC[o / 8] * w; wt += w; }
      const l = Math.hypot(r0, r1, r2, r3) || 1; r0 /= l; r1 /= l; r2 /= l; r3 /= l; d0 /= l; d1 /= l; d2 /= l; d3 /= l; sc /= wt || 1;
      const vx = R[k * 3] * sc, vy = R[k * 3 + 1] * sc, vz = R[k * 3 + 2] * sc;
      // v + 2 q x (q x v + w v)
      const cx = r1 * vz - r2 * vy + r3 * vx, cy = r2 * vx - r0 * vz + r3 * vy, cz = r0 * vy - r1 * vx + r3 * vz;
      const px = vx + 2 * (r1 * cz - r2 * cy), py = vy + 2 * (r2 * cx - r0 * cz), pz = vz + 2 * (r0 * cy - r1 * cx);
      // + 2 (w qd - wd q + q x qd)
      const mx = 2 * (r3 * d0 - d3 * r0 + r1 * d2 - r2 * d1), my = 2 * (r3 * d1 - d3 * r1 + r2 * d0 - r0 * d2), mz = 2 * (r3 * d2 - d3 * r2 + r0 * d1 - r1 * d0);
      UP[k * 3] = px + mx; UP[k * 3 + 1] = py + my; UP[k * 3 + 2] = pz + mz;
    }
    // the garment laid on the deformed skin (positions in the world: the skinned skin is in the world as well)
    const TV = this.TVs, BW = this.BW, OF = this.OF, NF = this.NF, out = this.pos.array, no = this.nor.array;
    for (let i = 0; i < this.n; i++) {
      const a = TV[i * 3] * 3, b = TV[i * 3 + 1] * 3, c = TV[i * 3 + 2] * 3, wa = BW[i * 3], wb = BW[i * 3 + 1], wc = BW[i * 3 + 2];
      const ax = UP[a], ay = UP[a + 1], az = UP[a + 2], bx = UP[b], by = UP[b + 1], bz = UP[b + 2], cx = UP[c], cy = UP[c + 1], cz = UP[c + 2];
      let t1x = bx - ax, t1y = by - ay, t1z = bz - az; const l1 = Math.hypot(t1x, t1y, t1z) || 1; t1x /= l1; t1y /= l1; t1z /= l1;
      const ex = cx - ax, ey = cy - ay, ez = cz - az; let nx = (by - ay) * ez - (bz - az) * ey, ny = (bz - az) * ex - (bx - ax) * ez, nz = (bx - ax) * ey - (by - ay) * ex;
      const ln = Math.hypot(nx, ny, nz) || 1; nx /= ln; ny /= ln; nz /= ln;
      const t2x = ny * t1z - nz * t1y, t2y = nz * t1x - nx * t1z, t2z = nx * t1y - ny * t1x;
      const o1 = OF[i * 3], o2 = OF[i * 3 + 1], o3 = OF[i * 3 + 2];
      out[i * 3] = ax * wa + bx * wb + cx * wc + t1x * o1 + t2x * o2 + nx * o3;
      out[i * 3 + 1] = ay * wa + by * wb + cy * wc + t1y * o1 + t2y * o2 + ny * o3;
      out[i * 3 + 2] = az * wa + bz * wb + cz * wc + t1z * o1 + t2z * o2 + nz * o3;
      const n1 = NF[i * 3], n2 = NF[i * 3 + 1], n3 = NF[i * 3 + 2];
      no[i * 3] = t1x * n1 + t2x * n2 + nx * n3; no[i * 3 + 1] = t1y * n1 + t2y * n2 + ny * n3; no[i * 3 + 2] = t1z * n1 + t2z * n2 + nz * n3;
    }
    for (const E of this.extra) {                                                     // the garment's own springs
      const P = E.B.parent; if (!P) continue; const d = P.localToWorld(E.B.position.clone()).sub(P.localToWorld(E.B.userData.restPos.clone()));
      if (d.lengthSq() < 1e-12) continue; const I = E.I, w = E.w; for (let k = 0; k < I.length; k++) { const i = I[k] * 3; out[i] += d.x * w[k]; out[i + 1] += d.y * w[k]; out[i + 2] += d.z * w[k]; }
    }
    this.pos.needsUpdate = true; this.nor.needsUpdate = true;                         // (frustum culling is off: no bounds needed)
  }
}
