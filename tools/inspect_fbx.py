"""Inspeciona um FBX do Tripo no Blender: tamanho, nº de vértices, cores e renders de 4 ângulos; salva os vértices em .npy para a análise de pernas.
   uso: blender --background --factory-startup --python tools/inspect_fbx.py -- <arquivo.fbx> <nome>"""
import bpy, os, sys, math
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
src, name = argv[0], argv[1]
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'tools', 'preview'); os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src, automatic_bone_orientation=True)
for obj in list(bpy.context.scene.objects):
    if obj.type != 'MESH': bpy.data.objects.remove(obj, do_unlink=True)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
mesh = meshes[0]
bpy.context.view_layer.objects.active = mesh; mesh.select_set(True)
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
v = np.array([tuple(mesh.matrix_world @ p.co) for p in mesh.data.vertices])
lo, hi = v.min(0), v.max(0)
print(f'[{name}] meshes={len(meshes)} verts={len(v)} faces={len(mesh.data.polygons)} materiais={[m.name for m in mesh.data.materials]}')
print(f'[{name}] bbox min={np.round(lo, 3).tolist()} max={np.round(hi, 3).tolist()} dim={np.round(hi - lo, 3).tolist()}')
np.save(os.path.join(OUT, f'{name}_verts.npy'), v)

# render: 4 ângulos com luz neutra
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'; scene.render.resolution_x = 700; scene.render.resolution_y = 700
scene.view_settings.view_transform = 'Standard'; scene.render.film_transparent = False
world = bpy.data.worlds.new('w'); world.use_nodes = True; world.node_tree.nodes['Background'].inputs[0].default_value = (0.35, 0.37, 0.42, 1); scene.world = world
center = Vector(((lo + hi) / 2).tolist()); size = float(np.max(hi - lo))
for lname, loc, power in [('Key', (1.5, -2, 2.5), 900), ('Fill', (-2, -1, 1.2), 400), ('Top', (0, 0, 3), 500)]:
    d = bpy.data.lights.new(lname, 'AREA'); d.energy = power * size ** 2; d.size = 3 * size
    ob = bpy.data.objects.new(lname, d); scene.collection.objects.link(ob); ob.location = center + Vector(loc) * size
    ob.rotation_euler = (center - ob.location).to_track_quat('-Z', 'Y').to_euler()
camd = bpy.data.cameras.new('c'); cam = bpy.data.objects.new('c', camd); scene.collection.objects.link(cam); scene.camera = cam
camd.type = 'ORTHO'; camd.ortho_scale = size * 1.35
views = {'frente': (0, -1, 0.25), 'lado': (1, 0, 0.25), 'topo': (0, -0.001, 1), 'tres_quartos': (1, -1, 0.7), 'baixo': (0, -0.001, -1), 'tras': (-1, 0, 0.15), 'tras3q': (-1, 1, 0.4)}
for vn, d in views.items():
    direction = Vector(d).normalized(); cam.location = center + direction * size * 3
    cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = os.path.join(OUT, f'{name}_{vn}.png'); bpy.ops.render.render(write_still=True)
print(f'[{name}] previews salvos em {OUT}')
