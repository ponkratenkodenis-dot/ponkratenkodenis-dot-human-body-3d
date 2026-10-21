// Test-only: how close the thumb tip comes to the index tip for given thumb settings (for OK / pinch gestures)
import * as THREE from "three";
const tip = (b, f, S) => { const a = b.bones[`finger${f}-3${S}`].getWorldPosition(new THREE.Vector3()), p = b.bones[`finger${f}-2${S}`].getWorldPosition(new THREE.Vector3()); return a.clone().add(a.clone().sub(p).multiplyScalar(f === 1 ? .95 : .85)); };
export function search(Body) {
  const b = Body.body, out = [];
  for (const opp of [0, .4, .8, 1.2, 1.6]) for (const cmc of [30, 45, 60]) {
    Body.run([{ op: "set", ...Object.fromEntries(["thumbL", "indexL", "middleL", "ringL", "littleL"].map(k => [k, 0])) }, { op: "snap" }]);
    b.THUMB_OPP = opp; b.CURL.thumb = [cmc, 50, 45]; b._setupExtremities();
    let best = [1e9];
    for (let t = .2; t <= 1.01; t += .1) for (let i = .3; i <= .91; i += .1) {
      b.setPose({ thumbL: t, indexL: i }); b.snap(); b.root.updateMatrixWorld(true);
      const d = tip(b, 1, "L").distanceTo(tip(b, 2, "L")); if (d < best[0]) best = [d, t, i];
    }
    // fist: thumb tip should lie on the middle phalanges of index/middle, not inside the palm
    b.setPose({ thumbL: .9, indexL: 1, middleL: 1, ringL: 1, littleL: 1 }); b.snap(); b.root.updateMatrixWorld(true);
    const fistD = tip(b, 1, "L").distanceTo(b.bones["finger2-2L"].getWorldPosition(new THREE.Vector3()));
    out.push({ opp, cmc, okDist_mm: Math.round(best[0] * 1000), thumb: +best[1].toFixed(1), index: +best[2].toFixed(1), fistThumbToIndexMid_mm: Math.round(fistD * 1000) });
  }
  return out.sort((a, c) => a.okDist_mm - c.okDist_mm);
}
export function fistThumb(Body) {
  const b = Body.body, out = [];
  for (let t = -.2; t <= 1.21; t += .1) {
    Body.run([{ op: "set", thumbL: t, indexL: 1, middleL: 1, ringL: 1, littleL: 1 }, { op: "snap" }]); b.root.updateMatrixWorld(true);
    const T = tip(b, 1, "L"), m2 = b.bones["finger2-2L"].getWorldPosition(new THREE.Vector3()), m3 = b.bones["finger3-2L"].getWorldPosition(new THREE.Vector3());
    out.push([+t.toFixed(1), Math.round(Math.min(T.distanceTo(m2), T.distanceTo(m3)) * 1000)]);
  }
  return out;
}
