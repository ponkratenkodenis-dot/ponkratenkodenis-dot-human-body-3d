"""List anatomy meshes of given Z-Anatomy collections with evaluated bounding boxes (planning/alignment helper)."""
import bpy, sys, json, re
from mathutils import Vector
import os
ROOT = os.environ.get("HB_ROOT", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
args = sys.argv[sys.argv.index("--")+1:]; out = args[0]; cols = args[1:]
p = os.path.join(ROOT, "src/zanat/Z-Anatomy/Startup.blend")
with bpy.data.libraries.load(p, link=False) as (src, dst):
    dst.collections = cols
for c in dst.collections: bpy.context.scene.collection.children.link(c)
dg = bpy.context.evaluated_depsgraph_get()
res = {}
for c in dst.collections:
    for o in c.all_objects:
        if o.type != 'MESH' or len(o.data.polygons) < 8 or re.search(r'\.(j|i|t|s|g)$', o.name): continue
        e = o.evaluated_get(dg); m = e.to_mesh()
        mw = o.matrix_world; co = [mw @ v.co for v in m.vertices]
        mn = [min(v[i] for v in co) for i in range(3)]; mx = [max(v[i] for v in co) for i in range(3)]
        res[o.name] = {"col": c.name, "v": len(m.vertices), "min": mn, "max": mx, "c": [(a+b)/2 for a,b in zip(mn,mx)]}
        e.to_mesh_clear()
json.dump(res, open(out, "w"), indent=0); print("DUMP", len(res))
