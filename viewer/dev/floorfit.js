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
