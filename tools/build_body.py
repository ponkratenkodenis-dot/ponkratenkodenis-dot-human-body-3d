"""Build the outer body (MakeHuman / MPFB2, CC0): a female adult with the MakeHuman 'default' rig
(5 spine + 3 neck bones, hands, face), plain skin material, eyes, brows, lashes, teeth, hair and a sports outfit.
Run headless:  blender -b --factory-startup --python tools/build_body.py -- out/body.blend
Saves a .blend that build_anatomy.py and export.py continue from."""
import bpy, sys, importlib, addon_utils

out = sys.argv[sys.argv.index("--") + 1]
addon_utils.enable("bl_ext.user_default.mpfb", default_set=True)


def imp(pkg, key):
    for m in list(sys.modules):
        if m.endswith(pkg):
            return getattr(importlib.import_module(m), key)
    raise ImportError(pkg)


HumanService = imp("mpfb.services.humanservice", "HumanService")
TargetService = imp("mpfb.services.targetservice", "TargetService")
AssetService = imp("mpfb.services.assetservice", "AssetService")
HOP = imp("mpfb.entities.objectproperties", "HumanObjectProperties")

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)

body = HumanService.create_human(mask_helpers=True, detailed_helpers=True, extra_vertex_groups=True, feet_on_ground=True, scale=0.1)
for k, v in {"gender": 1.0, "age": 0.5, "muscle": 0.55, "weight": 0.5, "height": 0.5, "proportions": 0.6,
             "cupsize": 0.5, "firmness": 0.5, "african": 0.0, "asian": 0.0, "caucasian": 1.0}.items():
    HOP.set_value(k, v, entity_reference=body)
TargetService.reapply_macro_details(body)
body.name = "Body"

rig = HumanService.add_builtin_rig(body, "default", import_weights=True)
rig.name = "Rig"

for subdir, fname, atype in [("eyes", "low-poly.mhclo", "Eyes"), ("eyebrows", "eyebrow001.mhclo", "Eyebrows"),
                             ("eyelashes", "eyelashes01.mhclo", "Eyelashes"), ("teeth", "teeth_base.mhclo", "Teeth"),
                             ("tongue", "tongue01.mhclo", "Tongue"), ("hair", "ponytail01.mhclo", "Hair"),
                             ("clothes", "female_sportsuit01.mhclo", "Clothes"), ("clothes", "shoes01.mhclo", "Clothes")]:
    p = AssetService.find_asset_absolute_path(fname, asset_subdir=subdir)
    if p:
        HumanService.add_mhclo_asset(p, body, asset_type=atype)
    else:
        print("BUILD missing asset", fname)

print("BUILD objects", [(o.name, o.type, len(o.data.vertices) if o.type == "MESH" else 0) for o in bpy.data.objects])
bpy.ops.wm.save_as_mainfile(filepath=out)
print("BUILD saved", out)
