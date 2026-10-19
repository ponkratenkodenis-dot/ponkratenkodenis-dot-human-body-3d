"""Report pelvimetry and rib-cage-to-skin clearance for a built anatomy.blend.
blender -b out/anatomy.blend --python tools/diag_trunk.py"""
import bpy, sys, os, re, json
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pelvimetry as PM

def V(n):
    o = bpy.data.objects[n]; a = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get("co", a); a = a.reshape(-1, 3)
    M = np.array(o.matrix_world); return a @ M[:3, :3].T + M[:3, 3]
def femhead(side):
    f = V(f"Femur.{side}"); m = f[np.abs(f[:, 0]) < np.median(np.abs(f[:, 0]))]; return m[m[:, 2] > m[:, 2].max() - .04].mean(0)

res, L = PM.measure(V("Hip bone.l"), V("Hip bone.r"), V("Sacrum"), femhead("l"), femhead("r"))
print("DIAG pelvis", json.dumps({k: round(v * (1 if k == "subpubic_angle" else 100), 1) for k, v in res.items()}), "(cm, deg)")

body = bpy.data.objects["Body"]
for m in body.modifiers:
    if m.type == "MASK" and m.vertex_group.startswith("Delete."): m.show_viewport = False
dg = bpy.context.evaluated_depsgraph_get(); me = body.evaluated_get(dg).to_mesh()
bvh = BVHTree.FromPolygons([body.matrix_world @ v.co for v in me.vertices], [p.vertices[:] for p in me.polygons])
def clearance(P):
    out = []
    for p in P:
        loc, nrm, _, d = bvh.find_nearest(Vector(p)); s = -1 if (Vector(p) - loc).dot(nrm) > 0 else 1; out.append(s * d)
    return np.array(out)
ribs = np.vstack([V(n) for n in bpy.data.objects.keys() if re.search(r" rib\.[lr]$", n)])
rep = {}
for lo, hi in [(1.10, 1.17), (1.17, 1.24), (1.24, 1.31), (1.31, 1.38)]:
    s = ribs[(ribs[:, 2] > lo) & (ribs[:, 2] < hi)]
    lat = s[np.abs(s[:, 0]) > np.abs(s[:, 0]).max() - .012]; back = s[s[:, 1] > s[:, 1].max() - .01]
    rep[f"{lo:.2f}-{hi:.2f}"] = {"lateral": round(float(np.median(clearance(lat))) * 100, 1), "back": round(float(np.median(clearance(back))) * 100, 1), "min": round(float(clearance(s[::7]).min()) * 100, 1)}
st = V("Body of sternum"); rep["sternum_front"] = round(float(np.median(clearance(st[st[:, 1] < st[:, 1].min() + .004]))) * 100, 1)
H = np.vstack([V("Hip bone.l"), V("Hip bone.r")]); rep["pelvis_min"] = round(float(clearance(H[::5]).min()) * 100, 1)
crest = H[H[:, 2] > H[:, 2].max() - .01]; rep["crest"] = round(float(np.median(clearance(crest))) * 100, 1)
man = V("Manubrium of sternum"); rep["manubrium_len"] = round(float(np.ptp(man[:, 2])) * 100, 1); rep["sternum_body_len"] = round(float(np.ptp(st[:, 2])) * 100, 1)
print("DIAG clearance cm", json.dumps(rep))

# inside/outside by ray parity (three directions, majority) — robust where nearest-normal signs flip in folds
def inside(p):
    votes = 0
    for d in ((1, 0, 0), (0, 1, 0.001), (0, 0, 1)):
        n, o = 0, Vector(p)
        for _ in range(20):
            hit = bvh.ray_cast(o, Vector(d))
            if hit[0] is None: break
            n += 1; o = hit[0] + Vector(d) * 1e-5
        votes += n % 2
    return votes >= 2
out = {}
for name, pts in [("pelvis", H[::3]), ("ribs", ribs[::6]), ("sternum", st[::3]), ("sacrum", V("Sacrum")[::3])]:
    o = [p for p in pts if not inside(p)]; out[name] = f"{len(o)}/{len(pts)} outside"; out[name + "_pts"] = [[round(float(c), 3) for c in q] for q in o[:6]]
print("DIAG outside", json.dumps(out))
