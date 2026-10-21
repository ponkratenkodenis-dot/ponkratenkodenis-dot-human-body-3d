"""Which bones of the skeleton come out through the skin in the rest pose, and how far.
blender -b out/anatomy.blend --python tools/diag_limbs.py [-- regex]"""
import bpy, sys, re, json
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

PAT = re.compile(sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else r".")
body = bpy.data.objects["Body"]
for m in body.modifiers:
    if m.type == "MASK" and m.vertex_group.startswith("Delete."): m.show_viewport = False
dg = bpy.context.evaluated_depsgraph_get(); me = body.evaluated_get(dg).to_mesh()
SV = np.array([body.matrix_world @ v.co for v in me.vertices])
bvh = BVHTree.FromPolygons([Vector(v) for v in SV], [p.vertices[:] for p in me.polygons])

def inside(p):
    votes = 0
    for d in ((1, 0.0013, 0.0007), (-0.0011, 1, 0.0017), (0.0019, -0.0007, 1)):
        n, o, dv = 0, Vector(p), Vector(d).normalized()
        for _ in range(30):
            hit = bvh.ray_cast(o, dv)
            if hit[0] is None: break
            n += 1; o = hit[0] + dv * 1e-5
        votes += n % 2
    return votes >= 2

def V(o):
    a = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get("co", a); a = a.reshape(-1, 3)
    M = np.array(o.matrix_world); return a @ M[:3, :3].T + M[:3, 3]

rep = {}
for o in bpy.data.objects:
    if o.type != "MESH" or o.get("layer") != "skeleton" and not (o.name.endswith((".l", ".r")) or o.name.startswith(("Vertebra", "Sacrum"))): continue
    if o.get("layer") not in (None, "skeleton") or not PAT.search(o.name) or re.search(r"ligament|disc|Nucleus|^M |^O ", o.name, re.I): continue
    P = V(o); step = max(1, len(P) // 400); P = P[::step]
    out = [p for p in P if not inside(p)]
    if not out: continue
    depth = [bvh.find_nearest(Vector(p))[3] for p in out]
    i = int(np.argmax(depth))
    rep[o.name] = {"out": len(out), "of": len(P), "max_mm": round(max(depth) * 1000), "at": [round(float(c), 3) for c in out[i]]}
for k, v in sorted(rep.items(), key=lambda kv: -kv[1]["max_mm"]):
    print("DIAG", k, json.dumps(v))
