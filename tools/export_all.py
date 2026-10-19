"""Export the whole model (rig + body + clothes + anatomy layers) to one GLB.
Each mesh keeps its name; anatomy meshes carry extras {"layer": "..."}; the skin carries a COLOR_0 mask
(R = under the sports suit, G = under the shoes) so viewers can hide skin under clothes without z-fighting.
blender -b out/anatomy.blend --python tools/export_all.py -- out/human.glb [--draco]"""
import bpy, sys

args = sys.argv[sys.argv.index("--") + 1:]
out = args[0]; draco = "--draco" in args
body = bpy.data.objects["Body"]

# clothing mask on the skin, from MPFB's delete groups
me = body.data
gi = {g.name: g.index for g in body.vertex_groups}
attr = me.color_attributes.get("ClothMask") or me.color_attributes.new("ClothMask", "FLOAT_COLOR", "POINT")
cols = [0.0] * (len(me.vertices) * 4)
for v in me.vertices:
    r = g = 0.0
    for gr in v.groups:
        if gr.group == gi.get("Delete.female_sportsuit01") and gr.weight > .5: r = 1.0
        if gr.group == gi.get("Delete.shoes01") and gr.weight > .5: g = 1.0
    cols[v.index * 4:v.index * 4 + 4] = [r, g, 0.0, 1.0]
attr.data.foreach_set("color", cols)
me.color_attributes.active_color = attr

for m in list(body.modifiers):
    if m.type == "MASK" and m.vertex_group.startswith("Delete."):
        body.modifiers.remove(m)
for o in bpy.data.objects:
    if o.type == "MESH":
        for m in list(o.modifiers):
            if m.type == "SUBSURF":
                o.modifiers.remove(m)
        if o.get("layer") in ("skeleton", "muscles", "organs") and len(o.data.materials) > 1:
            keep = o.data.materials[len(o.data.materials) - 1]; o.data.materials.clear(); o.data.materials.append(keep)
        o["name_orig"] = o.name[2:] if o.name.startswith("M ") else o.name
        o["layer"] = o.get("layer", "skin" if o.name == "Body" else "clothes" if o.name.startswith("Body.female") or o.name.startswith("Body.shoes") else "body")

if "Skin" not in bpy.data.materials:
    skin = bpy.data.materials.new("Skin"); skin.use_nodes = True
    b = skin.node_tree.nodes["Principled BSDF"]; b.inputs["Base Color"].default_value = (0.78, 0.58, 0.48, 1); b.inputs["Roughness"].default_value = 0.55
    body.data.materials.clear(); body.data.materials.append(skin)

names = {"Body.female_sportsuit01": "Clothes_Sportsuit", "Body.shoes01": "Clothes_Shoes", "Body.ponytail01": "Hair",
         "Body.low-poly": "Eyes", "Body.eyebrow001": "Eyebrows", "Body.eyelashes01": "Eyelashes",
         "Body.teeth_base": "Teeth", "Body.tongue01": "Tongue"}
for k, v in names.items():
    if k in bpy.data.objects:
        bpy.data.objects[k].name = v

# keep the file light: no texture above what a web viewer needs
LIM = {"ponytail": 1024, "teeth": 512, "tongue": 256, "brown_eye": 512, "eyebrow": 256, "eyelash": 256}
for img in bpy.data.images:
    if img.size[0] == 0: continue
    lim = next((v for k, v in LIM.items() if k in img.name), 1024)
    w, h = img.size
    if max(w, h) > lim:
        f = lim / max(w, h); img.scale(max(1, int(w * f)), max(1, int(h * f)))

kw = dict(filepath=out, export_format="GLB", export_apply=True, export_skins=True, export_animations=False, export_yup=True,
          export_image_format="JPEG", export_jpeg_quality=80, export_texcoords=True, export_normals=True,
          export_materials="EXPORT", use_selection=False, export_extras=True, export_vertex_color="ACTIVE",
          export_all_vertex_colors=False)
if draco:
    kw.update(export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
              export_draco_position_quantization=14, export_draco_normal_quantization=10)
try:
    bpy.ops.export_scene.gltf(**kw)
except TypeError as e:
    print("EXPORT fallback", e)
    for k in ("export_vertex_color", "export_all_vertex_colors"): kw.pop(k, None)
    kw["export_colors"] = True
    bpy.ops.export_scene.gltf(**kw)
print("EXPORT done", out)
