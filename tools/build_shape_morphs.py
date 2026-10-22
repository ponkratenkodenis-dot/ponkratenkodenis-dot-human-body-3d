"""Body-shape morphs for the viewer from MakeHuman's own macros (CC0 targets): breast size ('cupsize'), weight and
muscle, each sampled at 0, the model's value (0.5) and 1 with the other macros held at the model's values.
After every change MakeHuman refits all proxies to the new body (sports suit, shoes, eyes, brows, lashes, teeth,
tongue, hair), so they come out of the same step.

Writes viewer/shape-morph.json:
  {"unit": 1e-4, "macros": ["breast", "weight", "muscle"],
   "meshes": {<GLB mesh name>: {"n": k, "base": b64 int16[k*3], "d": {<macro>: [b64 int16[k*3] to 0, b64 int16[k*3] to 1]}}}}
Positions are rest positions in glTF axes (metres / unit) of the vertices that move under any macro; the viewer matches
them to GLB vertices by position and turns each pair of offsets into two morph targets.
blender -b out/body_clean.blend --python tools/build_shape_morphs.py -- viewer/shape-morph.json"""
import bpy, sys, json, base64, importlib, addon_utils
import numpy as np

out = sys.argv[sys.argv.index("--") + 1]
addon_utils.enable("bl_ext.user_default.mpfb", default_set=True)


def imp(pkg, key):
    for m in list(sys.modules):
        if m.endswith(pkg):
            return getattr(importlib.import_module(m), key)
    raise ImportError(pkg)


TargetService = imp("mpfb.services.targetservice", "TargetService")
ClothesService = imp("mpfb.services.clothesservice", "ClothesService")
HOP = imp("mpfb.entities.objectproperties", "HumanObjectProperties")
body = bpy.data.objects["Body"]
NAMES = {"Body.female_sportsuit01": "Clothes_Sportsuit", "Body.shoes01": "Clothes_Shoes", "Body.ponytail01": "Hair",
         "Body.low-poly": "Eyes", "Body.eyebrow001": "Eyebrows", "Body.eyelashes01": "Eyelashes",
         "Body.teeth_base": "Teeth", "Body.tongue01": "Tongue"}            # as export_all.py names them in the GLB
PROXIES = [bpy.data.objects[k] for k in NAMES if k in bpy.data.objects]
MACROS = {"breast": "cupsize", "weight": "weight", "muscle": "muscle"}
BODY_VERTS = 13380                                                      # MakeHuman helper geometry follows the body


def world(o, co):
    M = np.array(o.matrix_world); P = np.c_[co, np.ones(len(co))] @ M.T
    return np.c_[P[:, 0], P[:, 2], -P[:, 1]]                         # Blender Z-up -> glTF Y-up


def sample(vals):
    for k, v in vals.items(): HOP.set_value(k, v, entity_reference=body)
    TargetService.reapply_macro_details(body)
    key = body.shape_key_add(name="tmp_mix", from_mix=True)
    S = {"Body": world(body, np.array([p.co[:] for p in key.data]))[:BODY_VERTS]}; body.shape_key_remove(key)
    for o in PROXIES:
        ClothesService.fit_clothes_to_human(o, body)
        S[NAMES[o.name]] = world(o, np.array([v.co[:] for v in o.data.vertices]))
    return S


model = {m: HOP.get_value(m, entity_reference=body) for m in MACROS.values()}
print("SHAPE model macros", model)
base = sample(model); ends = {}
for name, macro in MACROS.items():
    ends[name] = [sample({**model, macro: 0.0}), sample({**model, macro: 1.0})]
sample(model)

UNIT = 1e-4
enc = lambda a: base64.b64encode(np.round(a / UNIT).astype("<i2").tobytes()).decode()
meshes = {}
for mesh, B in base.items():
    D = {n: [e[0][mesh] - B, e[1][mesh] - B] for n, e in ends.items()}
    move = np.zeros(len(B), bool)
    for n, (lo, hi) in D.items():
        move |= (np.linalg.norm(lo, axis=1) > 2 * UNIT) | (np.linalg.norm(hi, axis=1) > 2 * UNIT)
    idx = np.nonzero(move)[0]
    for n, (lo, hi) in D.items():
        print("SHAPE", mesh, n, "max to 0: %.1f mm, to 1: %.1f mm" % (np.linalg.norm(lo, axis=1).max() * 1e3, np.linalg.norm(hi, axis=1).max() * 1e3))
    assert np.abs(B).max() / UNIT < 32767 and all(np.abs(x).max() / UNIT < 32767 for d in D.values() for x in d)
    meshes[mesh] = {"n": int(len(idx)), "base": enc(B[idx]), "d": {n: [enc(lo[idx]), enc(hi[idx])] for n, (lo, hi) in D.items()}}
json.dump({"source": "MakeHuman macros cupsize / weight / muscle at 0, 0.5 (the model), 1 (CC0 targets); proxies refitted by MPFB",
           "unit": UNIT, "macros": list(MACROS), "meshes": meshes}, open(out, "w"))
print("SHAPE saved", out, {k: v["n"] for k, v in meshes.items()})
