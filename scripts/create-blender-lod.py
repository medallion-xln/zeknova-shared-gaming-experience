import argparse
import bpy
import os
import sys


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def decimate_meshes(ratio):
    processed = 0
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH" or not obj.data.polygons:
            continue
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        modifier = obj.modifiers.new(name="ZekNova_LOD", type="DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = ratio
        modifier.use_collapse_triangulate = True
        try:
            bpy.ops.object.modifier_apply(modifier=modifier.name)
            processed += 1
        except RuntimeError as error:
            obj.modifiers.remove(modifier)
            print(f"Skipping {obj.name}: {error}")
        finally:
            obj.select_set(False)
    return processed


parser = argparse.ArgumentParser()
parser.add_argument("--input", required=True)
parser.add_argument("--output", required=True)
parser.add_argument("--ratio", required=True, type=float)
script_args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
args = parser.parse_args(script_args)

clear_scene()
bpy.ops.import_scene.gltf(filepath=os.path.abspath(args.input), merge_vertices=True)
processed = decimate_meshes(max(0.01, min(1.0, args.ratio)))
if processed == 0:
    raise RuntimeError("No mesh could be decimated.")

os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=os.path.abspath(args.output),
    export_format="GLB",
    export_apply=True,
    export_animations=True,
    export_skins=True,
    export_morph=False,
    export_materials="EXPORT",
    export_image_format="AUTO",
    export_yup=True,
)
print(f"Created {args.output} at ratio {args.ratio} from {processed} mesh object(s).")
