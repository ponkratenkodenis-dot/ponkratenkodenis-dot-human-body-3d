"""Fit Z-Anatomy internal organs into the body, the same way as the muscles: warp by the nearest skeleton parts
(including the female pelvis/rib-cage reshaping), keep inside the skin, take the skin's bone weights.
Included: lungs (lobes), trachea, heart chambers, pulmonary trunk, oesophagus, stomach, duodenum, jejunum, ileum,
caecum, appendix, colon, rectum, liver, gallbladder, pancreas, spleen, urinary bladder, suprarenal glands.
Left out on purpose: kidneys (Z-Anatomy's kidney is adapted from a CC BY-NC model), teeth/gums (already in the skull),
liver segments and pleura (duplicates/envelopes), heart valves (hidden inside the chambers), sigmoid colon (its source mesh breaks into shards in the
pelvic fit), thyroid (its source mesh
is built from modifiers that do not survive the fit).
blender -b out/anatomy_m.blend --python tools/build_organs.py -- [ratio]"""
import bpy, re, sys
import numpy as np
from mathutils import Vector, Matrix, kdtree
from mathutils.bvhtree import BVHTree
import os
ROOT = os.environ.get("HB_ROOT", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
RATIO = float(args[0]) if args else 0.35
ZA = os.path.join(ROOT, "src/zanat/Z-Anatomy/Startup.blend")
OUT = os.path.join(ROOT, "out", "")
W = np.load(OUT + "warp.npz", allow_pickle=True)
pts, ids, mats = W["pts"], W["ids"], W["mats"]
disp = W["disp"] if "disp" in W.files else np.zeros_like(pts)
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

KEEP = re.compile(r"lobe of (left|right) lung|^Trachea$|^(Right|Left) (atrium|ventricle)$|^Pulmonary trunk$|^Oesophagus$|^Stomach$|^Duodenum$|^Jejunum$|^Ileum|"
                  r"^Caecum|appendix|colon$|^Rectum|^Liver$|^Gallbladder$|^Pancreas$|^Spleen$|^Urinary bladder$|^Suprarenal gland")
# organs are picked by object name (several of their collections in the .blend are empty shells)
with bpy.data.libraries.load(ZA, link=False) as (src, dst):
    dst.objects = [n for n in src.objects if KEEP.search(n) and not n.startswith("Meso") and n != "Sigmoid colon"]
tmp = bpy.data.collections.new("ZA organs"); bpy.context.scene.collection.children.link(tmp)
for o in dst.objects:
    if o is not None: tmp.objects.link(o)
dst.collections = [tmp]
dg = bpy.context.evaluated_depsgraph_get()
skip = re.compile(r"\.(j|i|t|s|g)$")
COLOR = [(r"lung", (0.86, 0.56, 0.58)), (r"Trachea|Oesophagus", (0.86, 0.74, 0.68)), (r"atrium|ventricle|Pulmonary trunk", (0.66, 0.14, 0.14)),
         (r"Liver", (0.46, 0.17, 0.12)), (r"Gallbladder", (0.36, 0.55, 0.30)), (r"Pancreas", (0.92, 0.76, 0.50)), (r"Spleen", (0.48, 0.14, 0.22)),
         (r"Stomach|Duodenum", (0.88, 0.60, 0.52)), (r"Jejunum|Ileum", (0.90, 0.68, 0.58)), (r"colon|Caecum|appendix|Rectum", (0.80, 0.56, 0.46)),
         (r"bladder", (0.92, 0.80, 0.56)), (r"Thyroid", (0.72, 0.30, 0.30)), (r"Suprarenal", (0.86, 0.66, 0.30))]
col = bpy.data.collections.new("Organs"); bpy.context.scene.collection.children.link(col)
MATS = {}
def organ_mat(name):
    rgb = next((c for p, c in COLOR if re.search(p, name)), (0.8, 0.6, 0.5))
    if rgb not in MATS:
        m = bpy.data.materials.new("Organ %.2f %.2f %.2f" % rgb); m.use_nodes = True
        bb = m.node_tree.nodes["Principled BSDF"]; bb.inputs["Base Color"].default_value = (*rgb, 1); bb.inputs["Roughness"].default_value = 0.4
        MATS[rgb] = m
    return MATS[rgb]
mats4 = [Matrix(m.tolist()) for m in mats]
objs = []
for c in dst.collections:
    for o in list(c.all_objects):
        if o.type not in ("MESH", "CURVE") or (o.type == "MESH" and len(o.data.polygons) < 8) or skip.search(o.name) or not KEEP.search(o.name) or o.name.startswith("Meso") or ("O " + o.name) in bpy.data.objects:
            continue
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), depsgraph=dg)
        if len(me.polygons) < 8: bpy.data.meshes.remove(me); continue
        me.transform(o.matrix_world)
        ob = bpy.data.objects.new("O " + o.name, me); col.objects.link(ob); objs.append(ob)
for c in list(dst.collections):
    for o in list(c.all_objects): bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(c)
print("ORG objects", len(objs), "verts", sum(len(o.data.vertices) for o in objs), sorted(o.name for o in objs))

nin = nout = 0
for ob in objs:
    me = ob.data
    if len(me.vertices) > 300:
        dm = ob.modifiers.new("dec", "DECIMATE"); dm.ratio = max(RATIO, 300 / len(me.vertices))
        bpy.context.view_layer.objects.active = ob
        with bpy.context.temp_override(object=ob, active_object=ob): bpy.ops.object.modifier_apply(modifier="dec")
    for v in me.vertices:
        p = v.co.copy()
        nb = kd.find_n(p, 16)                                     # organs are soft and far from bone: blend many bones smoothly
        acc = Vector((0, 0, 0)); ws = 0.0
        for (_, idx, d) in nb:
            w = 1.0 / (d * d + 9e-4)
            acc += (mats4[ids[idx]] @ p + Vector(disp[idx])) * w; ws += w
        q = acc / ws
        loc, nrm, _, dist = skin.find_nearest(q)
        if loc is not None and (q - loc).dot(nrm) > -0.002:
            q = loc - nrm * 0.002; nout += 1
        else:
            nin += 1
        v.co = q
    me.materials.clear(); me.materials.append(organ_mat(ob.name))
    ob["layer"] = "organs"
print("ORG warped; pulled inside skin", nout, "of", nin + nout)

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
print("ORG bound", len(objs), "verts", sum(len(o.data.vertices) for o in objs))
bpy.ops.wm.save_as_mainfile(filepath=OUT + "anatomy_mo.blend")
print("ORG saved")
