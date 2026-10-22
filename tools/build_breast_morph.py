"""Breast-size morph for the viewer: MakeHuman's own 'cupsize' macro (CC0 targets), sampled at 0, 0.5 (the model) and 1.
Writes viewer/breast-morph.json: for the skin and the sports top, the rest positions (glTF axes, metres) of the vertices
that move and their offsets toward the small and the large end.
The viewer matches GLB vertices to these by position and turns the offsets into two morph targets.
blender -b out/body_clean.blend --python tools/build_breast_morph.py -- viewer/breast-morph.json"""
import bpy, sys, json, importlib, addon_utils
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
top = next(o for o in bpy.data.objects if o.name.startswith("Body.female_sportsuit"))


def world(o, co):
    M = np.array(o.matrix_world); P = np.c_[co, np.ones(len(co))] @ M.T
    return np.c_[P[:, 0], P[:, 2], -P[:, 1]]                      # Blender Z-up -> glTF Y-up


def sample(c):
    HOP.set_value("cupsize", c, entity_reference=body); TargetService.reapply_macro_details(body)
    k = body.shape_key_add(name="tmp_mix", from_mix=True)
    B = np.array([p.co[:] for p in k.data]); body.shape_key_remove(k)
    ClothesService.fit_clothes_to_human(top, body)
    T = np.array([v.co[:] for v in top.data.vertices])
    return world(body, B), world(top, T)


B5, T5 = sample(0.5); B0, T0 = sample(0.0); B1, T1 = sample(1.0); sample(0.5)


def pack(base, lo, hi, n=None, eps=1e-4):
    dl, dh = lo - base, hi - base; m = (np.linalg.norm(dl, axis=1) > eps) | (np.linalg.norm(dh, axis=1) > eps)
    if n: m[n:] = False                                           # body only: MakeHuman helper geometry follows after vertex 13379
    idx = np.nonzero(m)[0]
    print("MORPH", len(base), "verts,", len(idx), "move; max small", np.linalg.norm(dl, axis=1).max(), "max large", np.linalg.norm(dh, axis=1).max())
    r = lambda a: [round(float(x), 4) for x in a.ravel()]
    return {"base": r(base[idx]), "small": r(dl[idx]), "large": r(dh[idx])}


json.dump({"source": "MakeHuman cupsize macro 0 / 0.5 / 1 (CC0)", "skin": pack(B5, B0, B1, 13380), "top": pack(T5, T0, T1)}, open(out, "w"))
print("MORPH saved", out)
