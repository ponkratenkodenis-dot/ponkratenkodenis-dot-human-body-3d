// Test-only: muscle parts whose posed vertices drift far from every bone (they do not follow the skeleton)
import * as THREE from "three";
export function strays(b, center, R = .2, top = 12) {
  b.root.updateMatrixWorld(true); const v = new THREE.Vector3(), C = new THREE.Vector3(...center), pts = [];
  for (const m of b.layerMeshes.skeleton) { if (!m.isSkinnedMesh) continue; const p = m.geometry.attributes.position, st = Math.max(1, Math.floor(p.count / 200));
    for (let i = 0; i < p.count; i += st) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); if (v.distanceTo(C) < R + .05) pts.push(v.clone()); } }
  const out = [];
  for (const m of b.layerMeshes.muscles) { if (!m.isSkinnedMesh) continue; const p = m.geometry.attributes.position, st = Math.max(1, Math.floor(p.count / 150)); let worst = 0, n = 0;
    for (let i = 0; i < p.count; i += st) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); if (v.distanceTo(C) > R) continue; n++;
      let d = 1e9; for (const q of pts) { const e = q.distanceToSquared(v); if (e < d) d = e; } worst = Math.max(worst, Math.sqrt(d)); }
    if (n) out.push({ name: m.userData.part, worst_mm: Math.round(worst * 1000) }); }
  return out.sort((a, c) => c.worst_mm - a.worst_mm).slice(0, top);
}
