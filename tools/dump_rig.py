import bpy, json, sys
out = sys.argv[sys.argv.index("--")+1]
r = bpy.data.objects["Rig"]; mw = r.matrix_world
json.dump({b.name: {"h": list(mw @ b.head_local), "t": list(mw @ b.tail_local), "p": b.parent.name if b.parent else None} for b in r.data.bones}, open(out, "w"), indent=0)
print("RIG", len(r.data.bones))
