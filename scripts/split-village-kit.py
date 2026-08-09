"""Split the generated ZekNovan village scene into browser-ready GLBs.

Usage:
  blender --background --factory-startup --python scripts/split-village-kit.py -- input.glb output_dir
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ASSETS = [
    ("garden-stand", "forest", 12_000),
    ("shade-canopy", "desert", 8_000),
    ("hanging-waypost", "wetlands", 2_500),
    ("sacred-shrub", "forest", 8_000),
    ("bone-railing", "highlands", 2_500),
    ("village-hearth", "arctic", 5_000),
    ("water-station", "wetlands", 5_000),
    ("supply-table", "highlands", 4_000),
    ("provision-sacks", "desert", 4_000),
    ("trade-supplies", "desert", 4_000),
    ("arched-bridge", "wetlands", 8_000),
    ("pottery-table", "highlands", 5_000),
    ("canopy-treehouse", "forest", 24_000),
    ("round-market-hut", "arctic", 14_000),
    ("seed-pod-hut", "arctic", 7_000),
    ("boundary-pole", "highlands", 1_500),
    ("village-banner", "desert", 2_500),
    ("timber-walkway-a", "wetlands", 2_000),
    ("timber-walkway-b", "wetlands", 2_000),
    ("oval-awning", "highlands", 5_000),
    ("leaf-shelter", "highlands", 5_000),
    ("sacred-garden", "forest", 10_000),
    ("moss-cottage", "forest", 16_000),
    ("trade-pavilion", "arctic", 16_000),
]


# The generator returned one flat, saturated vertex color per object. These
# two-tone palettes restore the reference pack's warm wood, moss, weathered
# stone, and restrained teal accents while retaining a lightweight vertex-
# color material (no additional textures or draw calls).
PALETTES = {
    "garden-stand": ("#4b3826", "#71824b", 0.52),
    "shade-canopy": ("#4c3827", "#2f7273", 0.55),
    "hanging-waypost": ("#4b3525", "#356f70", 0.66),
    "sacred-shrub": ("#36492f", "#768750", 0.42),
    "bone-railing": ("#625a4c", "#6b7749", 0.68),
    "village-hearth": ("#544b40", "#88613b", 0.58),
    "water-station": ("#5d5547", "#347879", 0.57),
    "supply-table": ("#503a27", "#6f8050", 0.72),
    "provision-sacks": ("#66513a", "#927b55", 0.58),
    "trade-supplies": ("#503a28", "#397476", 0.7),
    "arched-bridge": ("#575044", "#6c7c4c", 0.66),
    "pottery-table": ("#503a28", "#397476", 0.7),
    "canopy-treehouse": ("#493526", "#687b48", 0.62),
    "round-market-hut": ("#503a28", "#667849", 0.6),
    "seed-pod-hut": ("#553d29", "#3a7777", 0.63),
    "boundary-pole": ("#4b3625", "#6b7a4a", 0.82),
    "village-banner": ("#9b8247", "#2f7074", 0.44),
    "timber-walkway-a": ("#4a3828", "#6a5940", 0.72),
    "timber-walkway-b": ("#4a3828", "#6a5940", 0.72),
    "oval-awning": ("#4a3625", "#2f7074", 0.55),
    "leaf-shelter": ("#4b3727", "#697c4a", 0.5),
    "sacred-garden": ("#4c4436", "#71844e", 0.3),
    "moss-cottage": ("#4a3626", "#66794a", 0.6),
    "trade-pavilion": ("#4a3625", "#337276", 0.57),
}


def srgb_channel_to_linear(channel: float) -> float:
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def linear_color(hex_color: str) -> tuple[float, float, float, float]:
    value = hex_color.removeprefix("#")
    channels = [int(value[index : index + 2], 16) / 255 for index in (0, 2, 4)]
    return (*[srgb_channel_to_linear(channel) for channel in channels], 1.0)


def mix_color(low: tuple[float, ...], high: tuple[float, ...], amount: float, shade: float) -> tuple[float, float, float, float]:
    smooth = amount * amount * (3 - 2 * amount)
    return tuple((low[index] + (high[index] - low[index]) * smooth) * shade for index in range(3)) + (1.0,)


def apply_palette(obj: bpy.types.Object, slug: str) -> None:
    low_hex, high_hex, split = PALETTES[slug]
    low = linear_color(low_hex)
    high = linear_color(high_hex)
    z_values = [vertex.co.z for vertex in obj.data.vertices]
    minimum = min(z_values)
    span = max(max(z_values) - minimum, 0.000001)
    for attribute in list(obj.data.color_attributes):
        obj.data.color_attributes.remove(attribute)
    colors = obj.data.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="CORNER")
    for loop in obj.data.loops:
        vertex = obj.data.vertices[loop.vertex_index]
        normalized_height = (vertex.co.z - minimum) / span
        blend = max(0.0, min(1.0, (normalized_height - split + 0.18) / 0.36))
        # Subtle deterministic tonal variation prevents large low-poly faces
        # from reading as a single flat block of color.
        shade = 0.9 + ((loop.vertex_index * 37 + len(slug) * 17) % 19) / 190
        colors.data[loop.index].color = mix_color(low, high, blend, shade)
    obj.data.update()


def arguments() -> tuple[Path, Path]:
    argv = sys.argv[sys.argv.index("--") + 1 :]
    if len(argv) != 2:
        raise SystemExit("Expected: input.glb output_dir")
    return Path(argv[0]).resolve(), Path(argv[1]).resolve()


def source_mesh(part_index: int) -> bpy.types.Object:
    root = bpy.data.objects.get(f"model_part{part_index}")
    if root is None:
        raise RuntimeError(f"model_part{part_index} was not found")
    meshes = [child for child in root.children_recursive if child.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError(f"model_part{part_index} expected one mesh, found {len(meshes)}")
    return meshes[0]


def normalize_mesh(obj: bpy.types.Object) -> None:
    points = [vertex.co for vertex in obj.data.vertices]
    low = Vector((min(point[i] for point in points) for i in range(3)))
    high = Vector((max(point[i] for point in points) for i in range(3)))
    origin = Vector(((low.x + high.x) * 0.5, (low.y + high.y) * 0.5, low.z))
    for vertex in obj.data.vertices:
        vertex.co -= origin
    obj.data.update()


def triangle_count(obj: bpy.types.Object) -> int:
    return len(obj.data.polygons)


def export_part(part_index: int, definition: tuple[str, str, int], output_dir: Path) -> dict:
    slug, biome, target_triangles = definition
    source = source_mesh(part_index)
    mesh = source.data.copy()
    mesh.transform(source.matrix_world)
    obj = bpy.data.objects.new(slug, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj["zeknovaAsset"] = slug
    obj["recommendedBiome"] = biome
    normalize_mesh(obj)

    original_triangles = triangle_count(obj)
    if original_triangles > target_triangles:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        modifier = obj.modifiers.new(name="BrowserDecimation", type="DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = max(0.015, target_triangles / original_triangles)
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)

    for polygon in obj.data.polygons:
        polygon.use_smooth = True

    apply_palette(obj, slug)

    for candidate in bpy.context.selected_objects:
        candidate.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    output_path = output_dir / f"{slug}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_attributes=True,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
    )
    final_triangles = triangle_count(obj)
    size = obj.dimensions.copy()
    record = {
        "key": slug,
        "biome": biome,
        "file": f"{slug}.glb",
        "sourcePart": part_index,
        "originalTriangles": original_triangles,
        "triangles": final_triangles,
        "dimensions": [round(value, 6) for value in size],
        "bytes": output_path.stat().st_size,
    }
    bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.meshes.remove(mesh)
    return record


def main() -> None:
    input_path, output_dir = arguments()
    output_dir.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(input_path))
    records = [export_part(index, definition, output_dir) for index, definition in enumerate(ASSETS)]
    manifest = {
        "source": input_path.name,
        "assetCount": len(records),
        "originalTriangles": sum(item["originalTriangles"] for item in records),
        "triangles": sum(item["triangles"] for item in records),
        "bytes": sum(item["bytes"] for item in records),
        "assets": records,
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print("ZEKNOVA_VILLAGE_KIT=" + json.dumps(manifest))


main()
