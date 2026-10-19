"""Fit the Z-Anatomy skeleton (CC BY-SA 4.0, from BodyParts3D) into the MPFB body and bind it to the body's rig.

Every limb bone is moved by a similarity transform that puts its own joint centres (measured from the bone
geometry) onto the rig's joints; the trunk (pelvis, spine, ribs, sternum) gets one per-axis affine fit; the
cervical vertebrae blend from the trunk fit to the head fit. Each anatomical bone is then weighted 100 % to
its rig bone (discs and spinal ligaments are blended along the spine so they bend like real discs).
Writes out/anatomy.blend plus out/warp.npz (bone sample points + transforms) for the muscle stage.

blender -b out/body.blend --python tools/build_skeleton.py"""
import bpy, re, json, math
import numpy as np
from mathutils import Vector, Matrix
import os
ROOT = os.environ.get("HB_ROOT", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

ZA = os.path.join(ROOT, "src/zanat/Z-Anatomy/Startup.blend")
OUT = os.path.join(ROOT, "out", "")
rig = bpy.data.objects["Rig"]
RB = {b.name: (rig.matrix_world @ b.head_local, rig.matrix_world @ b.tail_local) for b in rig.data.bones}

with bpy.data.libraries.load(ZA, link=False) as (src, dst):
    dst.collections = ["Skeletal system", "Intervertebral disc"]
dg = bpy.context.evaluated_depsgraph_get()
for c in dst.collections:
    bpy.context.scene.collection.children.link(c)
dg = bpy.context.evaluated_depsgraph_get()

# ---- bake every real anatomy mesh to plain world-space vertices
PARTS = {}
skip = re.compile(r"\.(j|i|t|s|g)$|ligament of head of rib|Arytenoid|Corniculate|Cricoid|Thyroid cartilage|nasal septal|alar cartilage|Incus|Malleus|Stapes|Sinus of")
for c in dst.collections:
    for o in list(c.all_objects):
        if o.type != "MESH" or len(o.data.polygons) < 8 or skip.search(o.name) or o.name in PARTS:
            continue
        e = o.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(e, depsgraph=dg)
        me.transform(o.matrix_world)
        PARTS[o.name] = me
for c in list(dst.collections):
    for o in list(c.all_objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(c)
print("SKEL parts", len(PARTS))


def V(name):
    me = PARTS[name]; a = np.empty(len(me.vertices) * 3, dtype=np.float64); me.vertices.foreach_get("co", a); return a.reshape(-1, 3)


def top(a, d, axis=2):  return a[a[:, axis] > a[:, axis].max() - d].mean(0)
def bot(a, d, axis=2):  return a[a[:, axis] < a[:, axis].min() + d].mean(0)


def sim(p0, p1, q0, q1):
    """similarity transform taking segment p0->p1 onto q0->q1 (minimal rotation)"""
    p0, p1, q0, q1 = map(Vector, (p0, p1, q0, q1))
    a, b = (p1 - p0), (q1 - q0)
    s = b.length / a.length
    rot = a.normalized().rotation_difference(b.normalized()).to_matrix().to_4x4()
    return Matrix.Translation(q0) @ rot @ Matrix.Scale(s, 4) @ Matrix.Translation(-p0)


def J(b, end="h"):  return RB[b][0 if end == "h" else 1]


# ---- skin of the body (rest pose, helpers excluded, arms excluded) for the trunk fit
body = bpy.data.objects["Body"]
masks = [m for m in body.modifiers if m.type == "MASK"]
for m in masks: m.show_viewport = False
dg = bpy.context.evaluated_depsgraph_get(); bme = body.evaluated_get(dg).to_mesh()
SK = np.array([body.matrix_world @ v.co for v in bme.vertices]); body.evaluated_get(dg).to_mesh_clear()
for m in masks: m.show_viewport = True
gi = {g.index: g.name for g in body.vertex_groups}
keep = np.zeros(len(SK), bool); torso = np.zeros(len(SK), bool)
limb = re.compile(r"upperarm|lowerarm|wrist|finger|metacarpal|hand|upperleg|lowerleg|foot|toe")
for v in body.data.vertices:
    gs = {gi[g.group]: g.weight for g in v.groups}
    if gs.get("body", 0) <= 0: continue
    keep[v.index] = True
    dom = max(((n, w) for n, w in gs.items() if n in RB), key=lambda t: t[1], default=("", 0))[0]
    if dom and not limb.search(dom): torso[v.index] = True
TS = SK[torso]; body_top = SK[keep][:, 2].max()
def skin_halfwidth(z, d=.012): r = TS[np.abs(TS[:, 2] - z) < d]; return np.abs(r[:, 0]).max()
def skin_front(z, d=.012): r = TS[(np.abs(TS[:, 2] - z) < d) & (np.abs(TS[:, 0]) < .02)]; return r[:, 1].min()
def skin_back(z, d=.012): r = TS[(np.abs(TS[:, 2] - z) < d) & (np.abs(TS[:, 0]) < .03)]; return r[:, 1].max()

skull = np.vstack([V(n) for n in ("Frontal bone", "Parietal bone.l", "Parietal bone.r", "Occipital bone")])
sz = body_top / (skull[:, 2].max() + .006)
ribs = np.vstack([V(n) for n in PARTS if re.search(r" rib\.[lr]$", n)])
zr = ribs[np.argmax(np.abs(ribs[:, 0])), 2]; sx_t = (2 * skin_halfwidth(zr * sz) - 2 * .022) / (2 * np.abs(ribs[:, 0]).max())
hipb = np.vstack([V("Hip bone.l"), V("Hip bone.r")]); zi = hipb[np.argmax(np.abs(hipb[:, 0])), 2]
sx_p = (2 * skin_halfwidth(zi * sz) - 2 * .035) / (2 * np.abs(hipb[:, 0]).max())
st = V("Body of sternum"); zst = st[:, 2].mean()
tv = min((n for n in PARTS if re.match(r"Vertebra T\d+$", n)), key=lambda n: abs(V(n).mean(0)[2] - zst))
za_front, za_back = st[:, 1].min(), V(tv)[:, 1].max()
f_s, b_s = skin_front(zst * sz) + .012, skin_back(zst * sz) - .012
sy = (b_s - f_s) / (za_back - za_front); ty = f_s - za_front * sy
Mt = Matrix.Translation((0, ty, 0)) @ Matrix.Diagonal((sx_t, sy, sz, 1))
Mp = Matrix.Translation((0, ty, 0)) @ Matrix.Diagonal((sx_p, sy, sz, 1))
print("SKEL trunk sx/sy/sz", round(sx_t, 3), round(sy, 3), round(sz, 3), "pelvis sx", round(sx_p, 3), "ty", round(ty, 3))

T = {}        # part name -> 4x4
BONE = {}     # part name -> rig bone (rigid) ; or "SPINE" for per-vertex blend
for side, S in (("l", "L"), ("r", "R")):
    fem, tib, hum, rad = V(f"Femur.{side}"), V(f"Tibia.{side}"), V(f"Humerus.{side}"), V(f"Radius.{side}")
    medial = lambda a: a[np.abs(a[:, 0]) < np.median(np.abs(a[:, 0]))]
    hip = top(medial(fem), .04); knee = (bot(fem, .015) + top(tib, .015)) / 2; ankle = V(f"Talus.{side}").mean(0)
    sho = top(hum, .03); elb = (bot(hum, .015) + top(V(f"Ulna.{side}"), .02)) / 2; wri = bot(rad, .012)
    m3 = V(f"Third metacarpal bone.{side}"); mcp3 = m3[np.argmax(np.linalg.norm(m3 - wri, axis=1))]
    m2 = V(f"Second metatarsal bone.{side}"); mtp2 = m2[np.argmax(np.linalg.norm(m2 - ankle, axis=1))]
    cla = V(f"Clavicle.{side}"); scj = cla[np.argsort(np.abs(cla[:, 0]))[:40]].mean(0)
    segs = [
        (["Femur", "Patella"], hip, knee, Mp @ Vector(hip), J(f"lowerleg01.{S}"), f"upperleg02.{S}"),
        (["Tibia", "Fibula"], knee, ankle, J(f"lowerleg01.{S}"), J(f"foot.{S}"), f"lowerleg01.{S}"),
        (["Humerus"], sho, elb, J(f"upperarm01.{S}"), J(f"lowerarm01.{S}"), f"upperarm02.{S}"),
        (["Radius", "Ulna"], elb, wri, J(f"lowerarm01.{S}"), J(f"wrist.{S}"), f"lowerarm02.{S}"),
        (["Clavicle", "Scapula"], scj, sho, J(f"clavicle.{S}"), J(f"upperarm01.{S}"), f"clavicle.{S}"),
    ]
    for names, p0, p1, q0, q1, rb in segs:
        M = sim(p0, p1, q0, q1)
        for n in names:
            T[f"{n}.{side}"] = M; BONE[f"{n}.{side}"] = rb
    # carpals + metacarpal block on the wrist, phalanges on the finger bones
    Mw = sim(wri, mcp3, J(f"wrist.{S}"), J(f"finger3-1.{S}"))
    for n in PARTS:
        if n.endswith("." + side) and re.search(r"(Scaphoid|Lunate|Triquetrum|Pisiform|Trapezium|Trapezoid|Capitate|Hamate) bone", n):
            T[n] = Mw; BONE[n] = f"wrist.{S}"
    fing = {"first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5}
    for word, k in fing.items():
        meta = f"{word.capitalize()} metacarpal bone.{side}"
        chain = [meta, f"Proximal phalanx of {word} finger of hand.{side}", f"Middle phalanx of {word} finger of hand.{side}", f"Distal phalanx of {word} finger of hand.{side}"]
        rbones = ([f"finger1-1.{S}", f"finger1-2.{S}", None, f"finger1-3.{S}"] if k == 1 else [f"metacarpal{k-1}.{S}", f"finger{k}-1.{S}", f"finger{k}-2.{S}", f"finger{k}-3.{S}"])
        for pn, rbn in zip(chain, rbones):
            if pn not in PARTS or rbn is None:
                continue
            a = V(pn); ax = a - a.mean(0); u = np.linalg.svd(ax, full_matrices=False)[2][0]; pr = ax @ u
            e0, e1 = a[np.argmin(pr)], a[np.argmax(pr)]
            if np.linalg.norm(e0 - wri) > np.linalg.norm(e1 - wri): e0, e1 = e1, e0
            T[pn] = sim(e0, e1, J(rbn), J(rbn, "t")); BONE[pn] = rbn
    # foot block
    Mf = sim(ankle, mtp2, J(f"foot.{S}"), J(f"toe2-1.{S}"))
    for n in PARTS:
        if n.endswith("." + side) and (re.search(r"Talus|Calcaneus|Navicular|Cuboid|cuneiform|metatarsal|Sesamoid bones of foot", n) or "finger of foot" in n):
            T[n] = Mf; BONE[n] = f"foot.{S}"
    for word, k in fing.items():
        chain = [f"Proximal phalanx of {word} finger of foot.{side}", f"Middle phalanx of {word} finger of foot.{side}", f"Distal phalanx of {word} finger of foot.{side}"]
        rbones = [f"toe1-1.{S}", None, f"toe1-2.{S}"] if k == 1 else [f"toe{k}-1.{S}", f"toe{k}-2.{S}", f"toe{k}-3.{S}"]
        for pn, rbn in zip(chain, rbones):
            if pn in PARTS and rbn and rbn in RB:
                BONE[pn] = rbn

# head: atlas top -> skull vertex onto the rig head bone
c1top = top(V("Atlas (C1)"), .006); vertex = top(skull, .004)
Mh = sim(c1top, vertex, J("head"), J("head", "t"))

trunk_re = re.compile(r"Hip bone|Sacrum|Coccyx|rib|Rib|sternum|Sternum|Vertebra|Atlas|Axis|Intervertebral|Nucleus|ligament|Ligament|ligaments|Sacrococcygeal")
head_re = re.compile(r"bone|Mandible|tooth|incisor|canine|premolar|molar|Vomer|concha|Hyoid|Ethmoid|Sphenoid|Occipital|Frontal|Parietal|Temporal|Maxilla|Zygomatic|Palatine|Lacrimal|Nasal")
cerv = {"Atlas (C1)": 1, "Axis (C2)": 2}
for k in range(3, 8): cerv[f"Vertebra C{k}"] = k
for n in PARTS:
    if n in T: continue
    if n in cerv:                      # cervical: blend trunk fit (C7) -> head fit (C1)
        w = (7 - cerv[n]) / 6.0
        T[n] = Matrix((np.array(Mt) * (1 - w) + np.array(Mh) * w).tolist())
    elif re.match(r"Hip bone|Sacrum|Coccyx|Sacrococcygeal", n):
        T[n] = Mp
    elif trunk_re.search(n):
        T[n] = Mt
    elif head_re.search(n) or "Nuchal" in n:
        T[n] = Mh; BONE[n] = "jaw" if (n == "Mandible" or n.startswith("Lower")) and "jaw" in RB else "head"
    else:
        T[n] = Mt
# hyoid sits in the neck
if "Hyoid bone" in PARTS: BONE["Hyoid bone"] = "neck02"

# ---- apply transforms
for n, me in PARTS.items():
    me.transform(T[n])

# ---- spine chain: rig bones with their z-range after the fit
CHAIN = ["root", "spine05", "spine04", "spine03", "spine02", "spine01", "neck01", "neck02", "neck03", "head"]
def chain_bone(z):
    for b in CHAIN[1:]:
        h, t = RB[b]
        if min(h[2], t[2]) <= z < max(h[2], t[2]): return b
    return "head" if z >= RB["head"][0][2] else "root"
def zc(n):
    me = PARTS[n]; a = np.empty(len(me.vertices) * 3); me.vertices.foreach_get("co", a); return a.reshape(-1, 3)[:, 2].mean()
for n in PARTS:
    if n in BONE: continue
    if re.match(r"Hip bone|Sacrum|Coccyx|Sacrococcygeal", n): BONE[n] = "root"
    elif re.match(r"Vertebra|Atlas|Axis", n): BONE[n] = chain_bone(zc(n))
    elif re.search(r"(\w+) rib\.|Costal cartilage of (\w+) rib", n):
        ords = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"]
        w = re.search(r"(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)", n.lower()).group(1)
        BONE[n] = BONE.get(f"Vertebra T{ords.index(w) + 1}") or chain_bone(zc(f"Vertebra T{ords.index(w) + 1}"))
    elif re.search(r"sternum|Sternum", n): BONE[n] = "spine01"
    else: BONE[n] = "SPINE"             # discs, nuclei, long ligaments: per-vertex blend along the chain

# ---- objects, decimation, weights, armature
col = bpy.data.collections.new("Skeleton"); bpy.context.scene.collection.children.link(col)
bonemat = bpy.data.materials.new("Bone"); bonemat.use_nodes = True
bsdf = bonemat.node_tree.nodes["Principled BSDF"]; bsdf.inputs["Base Color"].default_value = (0.89, 0.85, 0.74, 1); bsdf.inputs["Roughness"].default_value = 0.6
discmat = bpy.data.materials.new("Disc"); discmat.use_nodes = True
d2 = discmat.node_tree.nodes["Principled BSDF"]; d2.inputs["Base Color"].default_value = (0.55, 0.72, 0.8, 1); d2.inputs["Roughness"].default_value = 0.4
ligmat = bpy.data.materials.new("Ligament"); ligmat.use_nodes = True
d3 = ligmat.node_tree.nodes["Principled BSDF"]; d3.inputs["Base Color"].default_value = (0.82, 0.8, 0.62, 1)
zs = [(b, (RB[b][0][2] + RB[b][1][2]) / 2) for b in CHAIN]
for n, me in PARTS.items():
    ob = bpy.data.objects.new(n, me); col.objects.link(ob)
    me.materials.clear(); me.materials.append(discmat if re.search(r"disc|Nucleus", n) else ligmat if re.search(r"ligament|Ligament", n) else bonemat)
    if len(me.vertices) > 2500:
        dm = ob.modifiers.new("dec", "DECIMATE"); dm.ratio = max(.35, 2500 / len(me.vertices))
        bpy.context.view_layer.objects.active = ob
        with bpy.context.temp_override(object=ob, active_object=ob): bpy.ops.object.modifier_apply(modifier="dec")
    b = BONE[n]
    if b == "SPINE":
        groups = {}
        for v in ob.data.vertices:
            z = v.co.z
            for i in range(len(zs) - 1):
                (b0, z0), (b1, z1) = zs[i], zs[i + 1]
                if z0 <= z <= z1 or (i == 0 and z < z0) or (i == len(zs) - 2 and z > z1):
                    t = min(1, max(0, (z - z0) / (z1 - z0 or 1)))
                    for bb, ww in ((b0, 1 - t), (b1, t)):
                        if ww > 0: groups.setdefault(bb, []).append((v.index, ww))
                    break
        for bb, lst in groups.items():
            g = ob.vertex_groups.new(name=bb)
            for vi, ww in lst: g.add([vi], ww, "REPLACE")
    else:
        g = ob.vertex_groups.new(name=b); g.add(list(range(len(ob.data.vertices))), 1.0, "REPLACE")
    ob.parent = rig
    am = ob.modifiers.new("Armature", "ARMATURE"); am.object = rig
    ob["layer"] = "skeleton"
print("SKEL bound", len(PARTS), "verts", sum(len(o.data.vertices) for o in col.objects))

# ---- warp data for the muscle stage: sampled original bone points + their part transforms
pts, ids, mats, names = [], [], [], []
for n in PARTS:
    names.append(n); mats.append(np.array(T[n]))
for i, n in enumerate(names):
    a = np.array([np.array(T[n].inverted() @ v.co) for v in bpy.data.objects[n].data.vertices])   # back to original Z-Anatomy space
    sel = a[:: max(1, len(a) // 400)]
    pts.append(sel); ids.append(np.full(len(sel), i))
np.savez(OUT + "warp.npz", pts=np.vstack(pts), ids=np.concatenate(ids), mats=np.array(mats), names=np.array(names))
json.dump({n: BONE[n] for n in PARTS}, open(OUT + "skeleton_bones.json", "w"), indent=0)
bpy.ops.wm.save_as_mainfile(filepath=OUT + "anatomy.blend")
print("SKEL saved")
