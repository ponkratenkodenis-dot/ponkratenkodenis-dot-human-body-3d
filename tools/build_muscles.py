"""Fit the Z-Anatomy muscles into the body: each vertex is warped by the transforms of the nearest skeleton parts
(inverse-distance blend, so muscles that span a joint follow both bones), then kept inside the skin, then given
the skin's bone weights (nearest-surface interpolation) so it deforms with the body.
blender -b out/anatomy.blend --python tools/build_muscles.py -- [ratio]"""
import bpy, re, sys
import numpy as np
from mathutils import Vector, Matrix, kdtree
from mathutils.bvhtree import BVHTree
import os
ROOT = os.environ.get("HB_ROOT", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
RATIO = float(args[0]) if args else 0.25
ZA = os.path.join(ROOT, "src/zanat/Z-Anatomy/Startup.blend")
OUT = os.path.join(ROOT, "out", "")
W = np.load(OUT + "warp.npz", allow_pickle=True)
pts, ids, mats = W["pts"], W["ids"], W["mats"]
kd = kdtree.KDTree(len(pts))
for i, p in enumerate(pts): kd.insert(Vector(p), i)
kd.balance()

rig = bpy.data.objects["Rig"]; body = bpy.data.objects["Body"]
masks = [m for m in body.modifiers if m.type == "MASK" and m.vertex_group.startswith("Delete.")]
for m in masks: m.show_viewport = False                       # full skin, helpers still masked
dg = bpy.context.evaluated_depsgraph_get()
bme = body.evaluated_get(dg).to_mesh()
skin = BVHTree.FromPolygons([body.matrix_world @ v.co for v in bme.vertices], [p.vertices[:] for p in bme.polygons])
body.evaluated_get(dg).to_mesh_clear()

with bpy.data.libraries.load(ZA, link=False) as (src, dst):
    dst.collections = ["Muscular system"]
for c in dst.collections: bpy.context.scene.collection.children.link(c)
dg = bpy.context.evaluated_depsgraph_get()
skip = re.compile(r"\.(j|i|t|s|g)$")
col = bpy.data.collections.new("Muscles"); bpy.context.scene.collection.children.link(col)
mat = bpy.data.materials.new("Muscle"); mat.use_nodes = True
b = mat.node_tree.nodes["Principled BSDF"]; b.inputs["Base Color"].default_value = (0.62, 0.17, 0.15, 1); b.inputs["Roughness"].default_value = 0.45
mats4 = [Matrix(m.tolist()) for m in mats]
objs = []
for c in dst.collections:
    for o in list(c.all_objects):
        if o.type != "MESH" or len(o.data.polygons) < 8 or skip.search(o.name) or o.name in bpy.data.objects and bpy.data.objects[o.name] in objs:
            continue
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), depsgraph=dg)
        me.transform(o.matrix_world)
        ob = bpy.data.objects.new("M " + o.name, me); col.objects.link(ob); objs.append(ob)
for c in list(dst.collections):
    for o in list(c.all_objects): bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(c)
print("MUS objects", len(objs), "verts", sum(len(o.data.vertices) for o in objs))

nin = nout = 0
for ob in objs:
    me = ob.data
    if len(me.vertices) > 300:
        dm = ob.modifiers.new("dec", "DECIMATE"); dm.ratio = max(RATIO, 300 / len(me.vertices))
        bpy.context.view_layer.objects.active = ob
        with bpy.context.temp_override(object=ob, active_object=ob): bpy.ops.object.modifier_apply(modifier="dec")
    for v in me.vertices:
        p = v.co.copy()
        nb = kd.find_n(p, 6)
        acc = Vector((0, 0, 0)); ws = 0.0
        for (_, idx, d) in nb:
            w = 1.0 / (d * d + 1e-5)
            acc += (mats4[ids[idx]] @ p) * w; ws += w
        q = acc / ws
        loc, nrm, _, dist = skin.find_nearest(q)
        if loc is not None and (q - loc).dot(nrm) > -0.002:
            q = loc - nrm * 0.002; nout += 1
        else:
            nin += 1
        v.co = q
    me.materials.clear(); me.materials.append(mat)
    ob["layer"] = "muscles"
print("MUS warped; pulled inside skin", nout, "of", nin + nout)

# skin weights onto the muscles
# delete masks stay off: under the clothes the skin must be complete for the weight transfer
for ob in objs:
    for g in body.vertex_groups:
        if g.name in rig.data.bones and g.name not in ob.vertex_groups: ob.vertex_groups.new(name=g.name)
    dt = ob.modifiers.new("dt", "DATA_TRANSFER"); dt.object = body; dt.use_vert_data = True
    dt.data_types_verts = {"VGROUP_WEIGHTS"}; dt.vert_mapping = "POLYINTERP_NEAREST"
    dt.layers_vgroup_select_src = "ALL"; dt.layers_vgroup_select_dst = "NAME"
    bpy.context.view_layer.objects.active = ob
    with bpy.context.temp_override(object=ob, active_object=ob): bpy.ops.object.modifier_apply(modifier="dt")
    for g in list(ob.vertex_groups):
        if g.name not in rig.data.bones: ob.vertex_groups.remove(g)
    ob.parent = rig
    am = ob.modifiers.new("Armature", "ARMATURE"); am.object = rig
print("MUS bound", len(objs), "verts", sum(len(o.data.vertices) for o in objs))
bpy.ops.wm.save_as_mainfile(filepath=OUT + "anatomy_m.blend")
print("MUS saved")
