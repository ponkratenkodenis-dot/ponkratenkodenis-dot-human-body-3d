// Test-only: find angles for all-fours and the bridge so the right body parts touch the floor together
import * as THREE from "three";
const h = (b, n, r) => b.bones[n].getWorldPosition(new THREE.Vector3()).y - r;
function put(Body, o) { const b = Body.body; Body.run([{ op: "set", ...o }, { op: "snap" }]); b.root.updateMatrixWorld(true); return b; }
export function allFours(Body) {
  let best = null;
  for (let p = 70; p <= 100; p += 2) for (let leg = 0; leg <= 40; leg += 5) {
    const o = { bodyPitch: p, kneeL: 90, kneeR: 90, legLForward: leg, legRForward: leg, armLForward: p, armRForward: p, armLRaise: 0, armRRaise: 0, elbowL: -50, elbowR: -50, wristLFlex: -75, wristRFlex: -75, ankleL: 60, ankleR: 60, hipFlex: 0 };
    const b = put(Body, o), knee = Math.min(h(b, "lowerleg01L", .05), h(b, "lowerleg01R", .05)), hand = Math.min(h(b, "finger3-1L", .012), h(b, "finger3-1R", .012), h(b, "wristL", .025));
    const sh = b.bones.upperarm01L.getWorldPosition(new THREE.Vector3()), hip = b.bones.root.getWorldPosition(new THREE.Vector3()), kn = b.bones.lowerleg01L.getWorldPosition(new THREE.Vector3());
    const thighTilt = Math.abs(Math.atan2(Math.hypot(hip.x - kn.x, hip.z - kn.z), hip.y - kn.y) * 180 / Math.PI);
    const score = Math.abs(knee - hand) * 100 + thighTilt * .05 + Math.abs(sh.y - hip.y) * 10;
    if (!best || score < best.score) best = { score: +score.toFixed(3), p, leg, kneeVsHand_mm: Math.round((knee - hand) * 1000), thighTilt: Math.round(thighTilt), shoulderMinusHip_mm: Math.round((sh.y - hip.y) * 1000) };
  }
  return best;
}
export function bridge(Body) {
  let best = null;
  for (let p = -90; p <= -50; p += 4) for (let K = 70; K <= 120; K += 10) for (let leg = -60; leg <= 20; leg += 10) for (const da of [-15, 0, 15]) {
    const o = { bodyPitch: p, kneeL: K, kneeR: K, legLForward: leg, legRForward: leg, armLRaise: -30, armRRaise: -30, elbowL: -50, elbowR: -50, ankleL: -p + da, ankleR: -p + da };
    const b = put(Body, o), sh = Math.min(h(b, "upperarm01L", .055), h(b, "spine01", .1)), heel = h(b, "footL", .055), ball = h(b, "toe2-1L", .015);
    const pel = h(b, "root", .1), score = Math.abs(sh) * 100 + Math.abs(heel - sh) * 100 + Math.abs(ball - sh) * 60 - Math.min(.25, pel - sh) * 20;
    if (!best || score < best.score) best = { score: +score.toFixed(3), p, K, leg, ankle: -p + da, heel_mm: Math.round((heel - sh) * 1000), ball_mm: Math.round((ball - sh) * 1000), pelvisUp_mm: Math.round((pel - sh) * 1000) };
  }
  return best;
}
export function bridge2(Body) {
  const b = Body.body; Body.run([{ op: "reset" }, { op: "snap" }]); let best = null;
  const base = Object.fromEntries(Object.keys(b.pose).map(k => [k, 0]));
  for (let p = -126; p <= -96; p += 2) for (let K = 70; K <= 130; K += 5) for (let leg = -95; leg <= 20; leg += 5) for (let da = -30; da <= 30; da += 5) {
    Object.assign(b.pose, base, { bodyPitch: p, kneeL: K, kneeR: K, legLForward: leg, legRForward: leg, armLRaise: -30, armRRaise: -30, elbowL: -50, elbowR: -50, ankleL: -p + da, ankleR: -p + da });
    b._applyPose(); b.root.updateMatrixWorld(true);
    const sh = Math.min(h(b, "upperarm01L", .055), h(b, "spine01", .1), h(b, "neck02", .055)), heel = h(b, "footL", .055), ball = h(b, "toe2-1L", .015), pel = h(b, "root", .1);
    if (pel - sh < (globalThis.PELMIN ?? .12)) continue;
    const score = Math.abs(sh) + Math.abs(heel - sh) + Math.abs(ball - sh);
    if (!best || score < best.score) best = { score: +score.toFixed(4), p, K, leg, ankle: -p + da, sh_mm: Math.round(sh * 1000), heel_mm: Math.round((heel - sh) * 1000), ball_mm: Math.round((ball - sh) * 1000), pelvisUp_mm: Math.round((pel - sh) * 1000) };
  }
  return best;
}
export function hug(Body) {
  const b = Body.body; Body.run([{ op: "pose", preset: "knees_to_chest" }, { op: "snap" }]); let best = null; const base = { ...b.pose };
  for (let f = -40; f <= 130; f += 5) for (let r = -80; r <= 20; r += 5) for (let e = -50; e <= 120; e += 10) {
    Object.assign(b.pose, base, { armLForward: f, armRForward: f, armLRaise: r, armRRaise: r, elbowL: e, elbowR: e }); b._applyPose(); b.root.updateMatrixWorld(true);
    const P = n => b.bones[n].getWorldPosition(new THREE.Vector3()), shin = P("lowerleg01L").lerp(P("footL"), .35);
    const d = P("wristL").distanceTo(shin);
    if (!best || d < best.d) best = { d: +d.toFixed(3), f, r, e };
  }
  return best;
}
// lifting poses: wrists on the sides of a 40 cm box near the floor (or at the belly), searched by coordinate descent
export function liftFit(Body, name, keys, target) {
  const b = Body.body; Body.run([{ op: "reset" }, { op: "snap" }]);
  const base = Object.fromEntries(Object.keys(b.pose).map(k => [k, 0]));
  let x = { ...b._frameState(base, { pose: name }) };
  const V = n => b.bones[n].getWorldPosition(new THREE.Vector3());
  const ev = q => { Object.assign(b.pose, q); b._applyPose(); b.root.updateMatrixWorld(true);
    const wl = V("wristL"), wr = V("wristR"), m = wl.clone().add(wr).multiplyScalar(.5), ball = V("toe2-1L"), pel = V("root"), nk = V("neck01");
    const up = nk.clone().sub(pel).normalize(), incl = Math.acos(up.y) * 180 / Math.PI, kn = Math.abs(V("lowerleg01L").x - V("lowerleg01R").x);
    return { y: m.y, sep: wl.distanceTo(wr), dz: m.z - (target.zRef === "pelvis" ? pel.z : ball.z), incl, kneeSep: kn }; };
  const cost = q => { const r = ev(q); return (r.y - target.y) ** 2 * 400 + (r.sep - .44) ** 2 * 200 + (r.dz - target.dz) ** 2 * 200 + ((r.incl - target.incl) / 30) ** 2 + (target.kneeSep ? Math.max(0, target.kneeSep - r.kneeSep) ** 2 * 400 : 0); };
  let c = cost(x), step = 8;
  while (step > .5) { let moved = false;
    for (const k of keys) for (const sg of [-1, 1]) { const y = { ...x }; for (const kk of k.split("|")) y[kk] = (y[kk] || 0) + sg * step; const c2 = cost(y); if (c2 < c) { x = y; c = c2; moved = true; } }
    if (!moved) step /= 2; }
  const r = ev(x), out = {}; for (const k of keys) for (const kk of k.split("|")) out[kk] = Math.round(x[kk]);
  return { name, cost: +c.toFixed(4), ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, +v.toFixed(3)])), set: out };
}
export function sitHands(Body) {
  const b = Body.body, base = Object.fromEntries(Object.keys(b.pose).map(k => [k, 0])); let x = b._frameState(base, { pose: "sit_chair" }), best = null;
  const V = n => b.bones[n].getWorldPosition(new THREE.Vector3());
  for (let f = -20; f <= 60; f += 5) for (let r = -85; r <= -10; r += 5) for (let e = -20; e <= 110; e += 10) {
    Object.assign(b.pose, x, { armLForward: f, armRForward: f, armLRaise: r, armRRaise: r, elbowL: e, elbowR: e }); b._applyPose(); b.root.updateMatrixWorld(true);
    const tgt = V("upperleg02L").lerp(V("lowerleg01L"), .55).add(new THREE.Vector3(0, .075, 0)), d = V("finger3-1L").distanceTo(tgt);
    if (!best || d < best.d) best = { d: +d.toFixed(3), f, r, e };
  }
  return best;
}
// rib hump in the Adams forward bend: height of the back skin left vs right of the spine at rib level
export function hump(Body, pose) {
  const b = Body.body; if (pose) Body.run([{ op: "pose", preset: pose }, { op: "snap" }]); b.root.updateMatrixWorld(true);
  const m = b.parts.get("Body"), p = m.geometry.attributes.position, v = new THREE.Vector3(), sp = b.bones.spine02.getWorldPosition(new THREE.Vector3()), sp1 = b.bones.spine01.getWorldPosition(new THREE.Vector3());
  const c = sp.clone().lerp(sp1, .5); let L = -1e9, R = -1e9;
  for (let i = 0; i < p.count; i++) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); if (Math.abs(v.z - c.z) > .06) continue; const dx = v.x - c.x;
    if (dx > .05 && dx < .12) L = Math.max(L, v.y); else if (dx < -.05 && dx > -.12) R = Math.max(R, v.y); }
  return { pose, left_mm: Math.round((L - c.y) * 1000), right_mm: Math.round((R - c.y) * 1000), diff_mm: Math.round((R - L) * 1000) };
}
export function humpSweep(Body) {
  const out = [];
  for (const tw of [-30, -20, -10, 10, 20, 30]) for (const sd of [0, 1]) {
    const b = Body.body, base = { ...b._frameState(Object.fromEntries(Object.keys(b.pose).map(k => [k, 0])), { pose: "adams_normal" }) };
    Object.assign(base, { thoracicTwist: tw, thoracicSide: sd ? -16 : 0, lumbarSide: sd ? 11 : 0, lumbarTwist: sd ? 7 * Math.sign(tw) * -1 * -1 : 0 });
    Body.run([{ op: "set", ...base }, { op: "snap" }]);
    const r = hump(Body, null); out.push({ tw, sides: sd, diff_mm: r.diff_mm });
  }
  return out;
}
