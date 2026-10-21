// Test-only: where the palm faces for a range of forearm rotations (arm hanging as in the anatomical position)
import * as THREE from "three";
export function palm(b, S) {
  b.root.updateMatrixWorld(true); const P = n => b.bones[n].getWorldPosition(new THREE.Vector3());
  const h = P("finger3-1" + S).sub(P("wrist" + S)), across = P("finger5-1" + S).sub(P("finger2-1" + S));
  return new THREE.Vector3().crossVectors(h, across).normalize().multiplyScalar(S === "L" ? b.PALM : -b.PALM);
}
export function sweep(Body, S = "L") {
  const b = Body.body, out = [];
  for (let a = -120; a <= 120; a += 20) {
    Body.run([{ op: "set", armLRaise: -38, armRRaise: -38, ["forearm" + S]: a }, { op: "snap" }]);
    const n = palm(b, S), th = b.bones["finger1-2" + S].getWorldPosition(new THREE.Vector3()).sub(b.bones["wrist" + S].getWorldPosition(new THREE.Vector3())).normalize();
    out.push({ a, palm: n.toArray().map(x => +x.toFixed(2)), thumbDir: th.toArray().map(x => +x.toFixed(2)) });
  }
  return out;
}
// true palm by anatomy: for a left hand palm = -(h x across), index->little; for a right hand +(h x across)
export function fistCheck(Body, S = "L") {
  const b = Body.body; Body.run([{ op: "reset" }, { op: "snap" }]); b.root.updateMatrixWorld(true);
  const P = n => b.bones[n].getWorldPosition(new THREE.Vector3());
  const h = P("finger3-1" + S).sub(P("wrist" + S)), across = P("finger5-1" + S).sub(P("finger2-1" + S));
  const truePalm = new THREE.Vector3().crossVectors(h, across).normalize().multiplyScalar(S === "L" ? -1 : 1);
  const tip0 = P("finger3-3" + S);
  Body.run([{ op: "hand", gesture: "fist", side: S === "L" ? "left" : "right" }, { op: "snap" }]); b.root.updateMatrixWorld(true);
  const disp = P("finger3-3" + S).sub(tip0);
  return { side: S, PALM: b.PALM, truePalm: truePalm.toArray().map(x => +x.toFixed(2)), tipMove_mm: Math.round(disp.length() * 1000), towardTruePalm: +disp.normalize().dot(truePalm).toFixed(2) };
}
export function proxCheck(Body, S = "L") {
  const b = Body.body; Body.run([{ op: "reset" }, { op: "snap" }]); b.root.updateMatrixWorld(true);
  const P = n => b.bones[n].getWorldPosition(new THREE.Vector3());
  const h = P("finger3-1" + S).sub(P("wrist" + S)), across = P("finger5-1" + S).sub(P("finger2-1" + S));
  const truePalm = new THREE.Vector3().crossVectors(h, across).normalize().multiplyScalar(S === "L" ? -1 : 1);
  Body.run([{ op: "hand", gesture: "fist", side: S === "L" ? "left" : "right" }, { op: "snap" }]); b.root.updateMatrixWorld(true);
  const prox = P("finger3-2" + S).sub(P("finger3-1" + S)).normalize(), th = P("finger1-3" + S).sub(P("finger1-2" + S)).normalize();
  return { side: S, proxPhalanxVsPalm: +prox.dot(truePalm).toFixed(2), proxVsHand: +prox.dot(h.normalize()).toFixed(2) };
}
export function anatSearch(Body, S = "L") {
  const b = Body.body; let best = null;
  const tp = () => { b.root.updateMatrixWorld(true); const P = n => b.bones[n].getWorldPosition(new THREE.Vector3());
    const h = P("finger3-1" + S).sub(P("wrist" + S)), across = P("finger5-1" + S).sub(P("finger2-1" + S));
    return [new THREE.Vector3().crossVectors(h, across).normalize().multiplyScalar(S === "L" ? -1 : 1), P("wrist" + S).sub(P("lowerarm01" + S)).normalize()]; };
  for (let e = -60; e <= 0; e += 5) for (let f = -140; f <= 0; f += 5) {
    Body.run([{ op: "set", armLRaise: -38, armRRaise: -38, elbowL: e, elbowR: e, forearmL: f, forearmR: f }, { op: "snap" }]);
    const [palm, fa] = tp(), score = palm.z - Math.abs(fa.z) * 2;
    if (!best || score > best.score) best = { score: +score.toFixed(3), elbow: e, forearm: f, palm: palm.toArray().map(x => +x.toFixed(2)), forearmDir: fa.toArray().map(x => +x.toFixed(2)) };
  }
  return best;
}
