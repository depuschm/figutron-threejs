import bpy
import os
import sys

output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets')
os.makedirs(output_dir, exist_ok=True)


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)


def make_material(name, color, metallic=0.1, roughness=0.38, emission=None):
    material = bpy.data.materials.new(name=name)
    material.diffuse_color = (*color, 1.0)
    material.use_nodes = True
    principled = material.node_tree.nodes.get('Principled BSDF')
    principled.inputs['Base Color'].default_value = (*color, 1.0)
    principled.inputs['Metallic'].default_value = metallic
    principled.inputs['Roughness'].default_value = roughness
    if emission:
        principled.inputs['Emission'].default_value = (*emission, 1.0)
        principled.inputs['Emission Strength'].default_value = 0.25
    return material


def export_glb(filename):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=os.path.join(output_dir, filename), export_format='GLB', use_selection=True, export_apply=True)


clear_scene()
player_material = make_material('Player | Ion Cyan', (0.08, 0.68, 0.63), 0.25, 0.32, (0.04, 0.5, 0.44))
trim_material = make_material('Player | Signal White', (0.67, 1.0, 0.94), 0.12, 0.28, (0.3, 0.9, 0.8))
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
body = bpy.context.object
body.name = 'PlayerBody'
body.dimensions = (0.78, 0.58, 1.02)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
body.data.materials.append(player_material)
bevel = body.modifiers.new('Soft machined edges', 'BEVEL')
bevel.width = 0.08
bevel.segments = 3
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.35, -0.07))
visor = bpy.context.object
visor.name = 'PlayerVisor'
visor.dimensions = (0.36, 0.12, 0.27)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
visor.data.materials.append(trim_material)
bevel = visor.modifiers.new('Visor bevel', 'BEVEL')
bevel.width = 0.035
bevel.segments = 2
export_glb('player.glb')

clear_scene()
enemy_material = make_material('Enemy | Signal Coral', (0.92, 0.19, 0.28), 0.12, 0.48, (0.5, 0.025, 0.045))
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.48, location=(0, 0, 0))
enemy = bpy.context.object
enemy.name = 'EnemyContact'
enemy.data.materials.append(enemy_material)
for polygon in enemy.data.polygons:
    polygon.use_smooth = True
export_glb('enemy.glb')