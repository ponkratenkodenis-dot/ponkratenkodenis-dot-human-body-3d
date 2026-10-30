// Motion from any humanoid rig onto the base character (MakeHuman skeleton): Rocketbox / 3ds Max Biped, Mixamo,
// Character Creator, Unreal mannequin. Rest poses may differ (T-pose source, A-pose target): every bone takes the
// source bone's change of world orientation since its rest, applied to the target bone first turned to point the way
// the source bone pointed at rest. Spine segments the source lacks share the bend of their neighbours; the forearm's
// second half takes half the wrist's twist (the skin of the forearm twists along, no candy wrapper at the wrist).
//   const clip = retarget({ root: gltf.scene, clip: gltf.animations[0] }, body.root, body.bones, { fps: 30 })
import * as THREE from "three";
const Q = THREE.Quaternion, V = THREE.Vector3, M = THREE.Matrix4;
const _p = new V(), _s = new V(), rotOf = m => { const q = new Q(); m.decompose(_p, q, _s); return q; };     // rigs come scaled (cm)

// source roles: three.js names (spaces -> "_", ":" "." removed)
const SRC = {
  hips: /^(Bip0?1_Pelvis|mixamorig\d*Hips|CC_Base_(Pelvis|Hip)|pelvis|Hips)$/i,
  spine: /^(Bip0?1_Spine|mixamorig\d*Spine|CC_Base_Waist|spine_01|Spine)$/i,
  spine1: /^(Bip0?1_Spine1|mixamorig\d*Spine1|CC_Base_Spine01|spine_02|Spine1)$/i,
  spine2: /^(Bip0?1_Spine2|mixamorig\d*Spine2|CC_Base_Spine02|spine_03|Spine2)$/i,
  neck: /^(Bip0?1_Neck|mixamorig\d*Neck|CC_Base_NeckTwist01|neck_01|Neck)$/i,
  head: /^(Bip0?1_Head|mixamorig\d*Head|CC_Base_Head|head|Head)$/i,
};
const FN = ["Thumb", "Index", "Middle", "Ring", "Pinky"], FNCC = ["Thumb", "Index", "Mid", "Ring", "Pinky"];
for (const [S, Side, s] of [["L", "Left", "l"], ["R", "Right", "r"]]) Object.assign(SRC, {
  ["clav" + S]: new RegExp(`^(Bip0?1_${S}_Clavicle|mixamorig\\d*${Side}Shoulder|CC_Base_${S}_Clavicle|clavicle_${s})$`, "i"),
  ["upper" + S]: new RegExp(`^(Bip0?1_${S}_UpperArm|mixamorig\\d*${Side}Arm|CC_Base_${S}_Upperarm|upperarm_${s})$`, "i"),
  ["fore" + S]: new RegExp(`^(Bip0?1_${S}_Forearm|mixamorig\\d*${Side}ForeArm|CC_Base_${S}_Forearm|lowerarm_${s})$`, "i"),
  ["hand" + S]: new RegExp(`^(Bip0?1_${S}_Hand|mixamorig\\d*${Side}Hand|CC_Base_${S}_Hand|hand_${s})$`, "i"),
  ["thigh" + S]: new RegExp(`^(Bip0?1_${S}_Thigh|mixamorig\\d*${Side}UpLeg|CC_Base_${S}_Thigh|thigh_${s})$`, "i"),
  ["calf" + S]: new RegExp(`^(Bip0?1_${S}_Calf|mixamorig\\d*${Side}Leg|CC_Base_${S}_Calf|calf_${s})$`, "i"),
  ["foot" + S]: new RegExp(`^(Bip0?1_${S}_Foot|mixamorig\\d*${Side}Foot|CC_Base_${S}_Foot|foot_${s})$`, "i"),
  ["toe" + S]: new RegExp(`^(Bip0?1_${S}_Toe0|mixamorig\\d*${Side}ToeBase|CC_Base_${S}_ToeBase|ball_${s})$`, "i"),
  ...Object.fromEntries([0, 1, 2, 3, 4].flatMap(f => [0, 1, 2].map(j => [`f${f}${j}${S}`, new RegExp(
    `^(Bip0?1_${S}_Finger${f}${j || ""}|mixamorig\\d*${Side}Hand${FN[f]}${j + 1}|CC_Base_${S}_${FNCC[f]}${j + 1}|${FN[f].toLowerCase()}_0${j + 1}_${s})$`, "i")])))
});
// the base (MakeHuman "default" rig, three.js names)
const DST = { hips: "root", spine: "spine05", spine1: "spine03", spine2: "spine01", neck: "neck01", head: "head" };
for (const S of ["L", "R"]) Object.assign(DST, { ["clav" + S]: "clavicle" + S, ["upper" + S]: "upperarm01" + S, ["fore" + S]: "lowerarm01" + S, ["hand" + S]: "wrist" + S,
  ["thigh" + S]: "upperleg01" + S, ["calf" + S]: "lowerleg01" + S, ["foot" + S]: "foot" + S, ["toe" + S]: "toe1-1" + S,
  ...Object.fromEntries([0, 1, 2, 3, 4].flatMap(f => [0, 1, 2].map(j => [`f${f}${j}${S}`, `finger${f + 1}-${j + 1}${S}`]))) });
// where each role points at rest (its child role); roles without one keep their own axis
// (limb segments only: there the line joint-to-joint is the same anatomy on every rig; spine segments, feet and the
// head sit differently from rig to rig, so they keep their own rest)
const NEXT = {};
for (const S of ["L", "R"]) { Object.assign(NEXT, { ["clav" + S]: "upper" + S, ["upper" + S]: "fore" + S, ["fore" + S]: "hand" + S, ["hand" + S]: "f20" + S,
  ["thigh" + S]: "calf" + S, ["calf" + S]: "foot" + S });
  for (let f = 0; f < 5; f++) for (let j = 0; j < 2; j++) NEXT[`f${f}${j}${S}`] = `f${f}${j + 1}${S}`; }
const BETWEEN = { spine04: ["spine05", "spine03"], spine02: ["spine03", "spine01"] };     // bones the source has no match for, in a chain
const TWIST = { lowerarm02L: "wristL", lowerarm02R: "wristR" };                        // half of the child's twist about the bone

// rest world matrices (relative to `root`) from local rest transforms
function restWorld(root, localOf) {
  const W = new Map(), walk = (o, P) => { const L = localOf(o), w = P.clone().multiply(L); W.set(o, w); for (const c of o.children) walk(c, w); };
  for (const c of root.children) walk(c, new M()); return W;
}
const findBone = (root, re) => { let hit = null; root.traverse(o => { if (!hit && (o.isBone || o.type === "Object3D") && re.test(o.name)) hit = o; }); return hit; };

export function retarget(src, dstRoot, dstBones, { fps = 30, move = true, name } = {}) {
  const sroot = src.root, clip = src.clip;
  // source rest: the nodes' own transforms as the file stores them (the rig's rest pose; the skins' inverse bind
  // matrices are not used: exporters put them in different spaces)
  sroot.updateMatrixWorld(true); const rootInv = sroot.matrixWorld.clone().invert();
  const nodeRest = restWorld(sroot, o => new M().compose(o.position, o.quaternion, o.scale)), sRest = o => nodeRest.get(o);
  const sb = {}; for (const [r, re] of Object.entries(SRC)) { const b = findBone(sroot, re); if (b) sb[r] = b; }
  const roles = Object.keys(DST).filter(r => sb[r] && dstBones[DST[r]]);
  if (!sb.hips || !sb.upperL || !sb.upperR) throw new Error("retarget: no humanoid skeleton in the source");
  // target rest (relative to its root), from the bones' rest quaternions / positions
  const tRestW = restWorld(dstRoot, o => new M().compose(o.userData.restPos || o.position, o.userData.rest || o.quaternion, o.scale));
  const tq = o => rotOf(tRestW.get(o)), tp = o => new V().setFromMatrixPosition(tRestW.get(o));
  const sq0 = o => rotOf(sRest(o)), sp0 = o => new V().setFromMatrixPosition(sRest(o));
  // facing: forward = (left shoulder - right shoulder) x up, for both; the source's motion is turned onto the target's
  const up = new V(0, 1, 0), fwd = (l, r) => new V().subVectors(l, r).cross(up).setY(0).normalize();
  const fS = fwd(sp0(sb.upperL), sp0(sb.upperR)), fT = fwd(tp(dstBones.upperarm01L), tp(dstBones.upperarm01R));
  const QF = new Q().setFromUnitVectors(fS, fT), QFi = QF.clone().invert();
  const scale = tp(dstBones.root).y / Math.max(1e-3, sp0(sb.hips).y);
  // per role: S = swing turning the target bone's rest direction onto the source's (in the target's frame)
  const swing = {};
  for (const r of roles) {
    const n = NEXT[r]; let q = new Q();
    if (n && sb[n] && dstBones[DST[n]]) {
      const ds = sp0(sb[n]).sub(sp0(sb[r])).applyQuaternion(QF).normalize(), dt = tp(dstBones[DST[n]]).sub(tp(dstBones[DST[r]])).normalize();
      const ls = sp0(sb[n]).distanceTo(sp0(sb[r])) * scale, lt = tp(dstBones[DST[n]]).distanceTo(tp(dstBones[DST[r]]));
      if (ls > .01 && lt > .01) q.setFromUnitVectors(dt, ds);                       // too short a bone has no direction
    }
    swing[r] = q;
  }
  // the target's bones in hierarchy order
  const order = []; dstRoot.traverse(o => { if (o.isBone) order.push(o); });
  const byName = Object.fromEntries(roles.map(r => [DST[r], r]));
  const touched = new Set([...roles.map(r => DST[r]), ...Object.keys(BETWEEN).filter(n => dstBones[n] && BETWEEN[n].every(m => byName[m])), ...Object.keys(TWIST).filter(n => dstBones[n] && byName[TWIST[n]])]);
  // sample the source
  const mixer = new THREE.AnimationMixer(sroot), act = mixer.clipAction(clip); act.play();
  const N = Math.max(2, Math.round(clip.duration * fps) + 1), times = new Float32Array(N), tracks = {}; for (const n of touched) tracks[n] = new Float32Array(N * 4);
  const rootPos = new Float32Array(N * 3), sHips0 = sp0(sb.hips), tRoot0 = tp(dstBones.root);
  const sw = new Q(), dW = {}, W = new Map(), Wq = new Map();
  for (let k = 0; k < N; k++) {
    const t = Math.min(clip.duration, k / fps); times[k] = t; mixer.setTime(t); sroot.updateMatrixWorld(true);
    for (const r of roles) {                                  // world change since rest, turned to the target's facing
      sw.copy(rotOf(new M().multiplyMatrices(rootInv, sb[r].matrixWorld)));
      dW[DST[r]] = QF.clone().multiply(sw.multiply(sq0(sb[r]).invert())).multiply(QFi);
    }
    W.clear(); Wq.clear();
    for (const b of order) {
      const P = b.parent && b.parent.isBone ? Wq.get(b.parent) : tRestW.has(b.parent) ? rotOf(tRestW.get(b.parent)) : new Q();
      let wq;
      if (byName[b.name]) wq = dW[b.name].clone().multiply(swing[byName[b.name]]).multiply(tq(b));
      else if (touched.has(b.name) && BETWEEN[b.name]) { const [a, c] = BETWEEN[b.name]; wq = dW[a].clone().slerp(dW[c], .5).multiply(swing[byName[a]]).multiply(tq(b)); }
      else wq = P.clone().multiply(b.userData.rest || b.quaternion);
      Wq.set(b, wq); W.set(b, P.clone().invert().multiply(wq));        // local
    }
    for (const [tw, child] of Object.entries(TWIST)) {                 // the forearm's second half: half the wrist's twist
      const B = dstBones[tw], C = dstBones[child]; if (!touched.has(tw)) continue;
      const lc = W.get(C), rc = C.userData.rest || C.quaternion;           // bones point along their local y
      const rel = rc.clone().invert().multiply(lc), half = new Q().slerp(new Q(0, rel.y, 0, rel.w).normalize(), .5);
      W.set(B, W.get(B).clone().multiply(half)); W.set(C, half.clone().invert().multiply(lc));     // the wrist keeps its world turn
    }
    for (const n of touched) W.get(dstBones[n]).toArray(tracks[n], k * 4);
    const pos = sb.hips.getWorldPosition(new V()).applyMatrix4(rootInv).sub(sHips0).applyQuaternion(QF).multiplyScalar(scale);
    if (!move) pos.x = pos.z = 0;
    const R = dstBones.root, local = tRoot0.clone().add(pos); if (R.parent && R.parent !== dstRoot) local.applyMatrix4(tRestW.get(R.parent).clone().invert());
    local.toArray(rootPos, k * 3);
  }
  act.stop(); mixer.uncacheRoot(sroot);
  for (const n of touched) { const a = tracks[n]; for (let k = 1; k < N; k++) if (a[k * 4] * a[k * 4 - 4] + a[k * 4 + 1] * a[k * 4 - 3] + a[k * 4 + 2] * a[k * 4 - 2] + a[k * 4 + 3] * a[k * 4 - 1] < 0) for (let c = 0; c < 4; c++) a[k * 4 + c] *= -1; }
  const T = [...touched].map(n => new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, times, tracks[n]));
  T.push(new THREE.VectorKeyframeTrack("root.position", times, rootPos));
  return new THREE.AnimationClip(name || clip.name, clip.duration, T);
}
export const RETARGET_ROLES = { SRC, DST };
