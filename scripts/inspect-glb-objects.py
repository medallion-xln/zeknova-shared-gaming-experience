"""Inspect and render every mesh group in a GLB with Blender.

Usage:
  blender --background --factory-startup --python scripts/inspect-glb-objects.py -- input.glb output_dir
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def arguments() -> tuple[Path, Path]:
    argv = sys.argv[sys.argv.index("--") + 1 :]
    if len(argv) != 2:
        raise SystemExit("Expected: input.glb output_dir")
    return Path(argv[0]).resolve(), Path(argv[1]).resolve()


def world_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    return (
        Vector((min(point[i] for point in points) for i in range(3))),
        Vector((max(point[i] for point in points) for i in range(3))),
    )


def frame_camera(camera: bpy.types.Object, objects: list[bpy.types.Object]) -> dict[str, list[float]]:
    low, high = world_bounds(objects)
    center = (low + high) * 0.5
    size = max(high - low)
    camera.location = center + Vector((size * 1.35, -size * 1.8, size * 1.15))
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = max(size * 1.45, 0.001)
    return {
        "min": [round(value, 6) for value in low],
        "max": [round(value, 6) for value in high],
        "size": [round(value, 6) for value in high - low],
    }


def configure_scene(output_dir: Path) -> bpy.types.Object:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.display.shading.cavity_type = "WORLD"
    scene.display.shading.background_type = "WORLD"
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world = scene.world or bpy.data.worlds.new("InspectionWorld")
    scene.world.color = (0.025, 0.035, 0.05)
    camera_data = bpy.data.cameras.new("InspectionCamera")
    camera = bpy.data.objects.new("InspectionCamera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera_data.clip_start = 0.00001
    camera_data.clip_end = 1000
    output_dir.mkdir(parents=True, exist_ok=True)
    return camera


def mesh_groups() -> list[tuple[str, list[bpy.types.Object]]]:
    groups = []
    for root in sorted(
        (obj for obj in bpy.context.scene.objects if obj.name.startswith("model_part")),
        key=lambda obj: int(obj.name.removeprefix("model_part")),
    ):
        meshes = [child for child in root.children_recursive if child.type == "MESH"]
        if meshes:
            groups.append((root.name, meshes))
    return groups


def main() -> None:
    input_path, output_dir = arguments()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(input_path))
    camera = configure_scene(output_dir)
    groups = mesh_groups()
    all_meshes = [obj for _, meshes in groups for obj in meshes]
    manifest = {
        "source": str(input_path),
        "meshGroupCount": len(groups),
        "totalTriangles": sum(len(obj.data.polygons) for obj in all_meshes),
        "groups": [],
    }

    for name, meshes in groups:
        for obj in all_meshes:
            obj.hide_render = obj not in meshes
        bounds = frame_camera(camera, meshes)
        bpy.context.scene.render.filepath = str(output_dir / f"{name}.png")
        bpy.ops.render.render(write_still=True)
        manifest["groups"].append(
            {
                "name": name,
                "meshes": [obj.name for obj in meshes],
                "triangles": sum(len(obj.data.polygons) for obj in meshes),
                "vertices": sum(len(obj.data.vertices) for obj in meshes),
                "bounds": bounds,
            }
        )

    for obj in all_meshes:
        obj.hide_render = False
    manifest["combinedBounds"] = frame_camera(camera, all_meshes)
    bpy.context.scene.render.resolution_x = 1024
    bpy.context.scene.render.resolution_y = 1024
    bpy.context.scene.render.filepath = str(output_dir / "combined.png")
    bpy.ops.render.render(write_still=True)
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print("ZEKNOVA_INSPECTION=" + json.dumps(manifest))


main()
