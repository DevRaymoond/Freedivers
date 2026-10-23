"""Titã ácido: monta o modelo a partir do FBX do Tripo (tools/source/mC), corrige as pernas, faz o rig e cria as animações.
   blender --background --factory-startup --python tools/build_titan.py [-- preview]
   Saídas: assets/titan.blend, assets/titan.glb (depois rode tools/shrink_glb.py assets/titan.glb), tools/preview/titan_*.png

Correções no modelo original (validação em tools/validar_modelos.md):
 - o FBX vem com 5 pernas (par traseiro incompleto): a perna traseira solitária é afastada do eixo e espelhada, formando o 3º par;
 - a malha tem ~24 mil vértices e é reduzida (~35%), mantendo o aspecto facetado;
 - as faces do saco de ácido (amarelo-esverdeado na textura) ganham material próprio com brilho (emissão).
Ações: Idle, Walk (lento, passos em trípode), Stomp (pisada: levanta o par da frente e esmaga) e Jet (jato de ácido pela boca)."""
import bpy, bmesh, os, sys, glob, math
import numpy as np
from mathutils import Vector, Quaternion

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = glob.glob(os.path.join(ROOT, 'tools', 'source', 'mC', '*.fbx'))[0]
OUT_BLEND = os.path.join(ROOT, 'assets', 'titan.blend')
OUT_GLB = os.path.join(ROOT, 'assets', 'titan.glb')
PREV = os.path.join(ROOT, 'tools', 'preview'); os.makedirs(PREV, exist_ok=True)
FPS = 24
DO_PREVIEW = 'preview' in sys.argv

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SRC, automatic_bone_orientation=True)
for o in list(bpy.context.scene.objects):
    if o.type != 'MESH': bpy.data.objects.remove(o, do_unlink=True)
mesh = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
mesh.name = 'TitanMesh'; mesh.data.name = 'TitanGeometry'
bpy.context.view_layer.objects.active = mesh; mesh.select_set(True)
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
mesh.location = (0, 0, 0)

# ───────────── 1. terceiro par de pernas: espelha a perna traseira solitária ─────────────
bm = bmesh.new(); bm.from_mesh(mesh.data); bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
LEG5 = [(0.425, 0.09, 0.0), (0.40, 0.10, 0.19), (0.35, 0.13, 0.33), (0.31, 0.135, 0.43), (0.29, 0.14, 0.52)]
def near(path, p):
    best = 9.0
    for a, b in zip(path[:-1], path[1:]):
        a = np.array(a); b = np.array(b); d = b - a; t = np.clip(np.dot(p - a, d) / np.dot(d, d), 0, 1)
        best = min(best, np.linalg.norm(p - (a + t * d)))
    return best
sel = {v.index for v in bm.verts if v.co.z < 0.52 and near(LEG5, np.array(v.co)) < 0.068}
faces = [f for f in bm.faces if all(v.index in sel for v in f.verts)]
dup = bmesh.ops.duplicate(bm, geom=faces)
newv = [g for g in dup['geom'] if isinstance(g, bmesh.types.BMVert)]
newf = [g for g in dup['geom'] if isinstance(g, bmesh.types.BMFace)]
SHIFT = 0.07
for v in newv: v.co.y = -v.co.y - SHIFT
bmesh.ops.reverse_faces(bm, faces=newf)
for v in bm.verts:
    if v.index in sel: v.co.y += SHIFT
bm.to_mesh(mesh.data); bm.free()
print('Perna espelhada: vértices', len(sel), 'faces', len(faces))

# ───────────── 2. redução da malha ─────────────
before = len(mesh.data.vertices)
dec = mesh.modifiers.new('Decimate', 'DECIMATE'); dec.decimate_type = 'COLLAPSE'; dec.ratio = 0.35
bpy.ops.object.modifier_apply(modifier=dec.name)
print('Vértices:', before, '->', len(mesh.data.vertices))
for p in mesh.data.polygons: p.use_smooth = False

# ───────────── 3. material do saco de ácido (emissivo) ─────────────
body_mat = mesh.data.materials[0]
tex = next((n.image for n in body_mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image and 'color' in os.path.basename(n.image.filepath).lower()), None)
acid = body_mat.copy(); acid.name = 'Titan | Acid sac'
ab = acid.node_tree.nodes.get('Principled BSDF')
ab.inputs['Emission Color'].default_value = (0.5, 0.95, 0.05, 1.0); ab.inputs['Emission Strength'].default_value = 0.45
body_mat.name = 'Titan | Original PBR'
mesh.data.materials.append(acid)
if tex:
    w, h = tex.size; px = np.array(tex.pixels[:], dtype=np.float32).reshape(h, w, 4)
    uv = mesh.data.uv_layers.active.data; n_acid = 0
    for poly in mesh.data.polygons:
        u = np.mean([uv[l].uv[0] for l in poly.loop_indices]); v_ = np.mean([uv[l].uv[1] for l in poly.loop_indices])
        r, g, b = px[min(h - 1, max(0, int(v_ * h))), min(w - 1, max(0, int(u * w)))][:3]
        if g > 0.5 and b < 0.12 and r > 0.15 and g > r * 1.08: poly.material_index = 1; n_acid += 1
    print('Faces do saco de ácido:', n_acid, 'de', len(mesh.data.polygons))

# ───────────── 4. orientação: a boca olha para -Y (o GLB sai olhando para +Z, como a aranha) ─────────────
mesh.rotation_euler = (0, 0, math.pi / 2); bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
T = lambda p: (-p[1], p[0], p[2])          # mesma rotação aplicada aos pontos que eu defini com a cabeça em -X
verts = np.asarray([v.co[:] for v in mesh.data.vertices], dtype=np.float64)

# ───────────── 5. esqueleto: 6 pernas (2 ossos cada), cabeça, tórax e abdômen ─────────────
LEGS = [  # nome, pé, joelho, quadril (cabeça em -X, antes da rotação)
    ('FL', (-0.31, 0.23, 0.0), (-0.19, 0.16, 0.50), (-0.20, 0.09, 0.66)),
    ('FR', (-0.26, -0.35, 0.0), (-0.205, -0.18, 0.50), (-0.21, -0.11, 0.65)),
    ('ML', (0.01, 0.36, 0.0), (0.05, 0.27, 0.50), (0.03, 0.17, 0.64)),
    ('MR', (0.06, -0.35, 0.0), (0.07, -0.26, 0.50), (0.01, -0.17, 0.64)),
    ('RL', (0.425, 0.09 + SHIFT, 0.0), (0.30, 0.14 + SHIFT, 0.50), (0.24, 0.19, 0.62)),
    ('RR', (0.425, -0.09 - SHIFT, 0.0), (0.30, -0.14 - SHIFT, 0.50), (0.24, -0.19, 0.62)),
]
legs = [dict(name=n, foot=np.array(T(f)), knee=np.array(T(k)), hip=np.array(T(h)), side=1 if f[1] > 0 else -1, front=f[0]) for n, f, k, h in LEGS]
arm_data = bpy.data.armatures.new('TitanRig'); arm = bpy.data.objects.new('TitanRig', arm_data)
bpy.context.collection.objects.link(arm); bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
def add_bone(name, head, tail, parent=None):
    b = arm_data.edit_bones.new(name); b.head = head; b.tail = tail
    if parent: b.parent = arm_data.edit_bones[parent]
    return b
add_bone('Root', T((0, 0, 0)), T((0, 0, 0.12)))
add_bone('Thorax', T((-0.16, 0, 0.60)), T((0.04, 0, 0.60)), 'Root')
add_bone('Head', T((-0.27, 0, 0.56)), T((-0.50, 0, 0.50)), 'Thorax')
add_bone('Abdomen', T((0.02, 0, 0.62)), T((0.52, 0, 0.62)), 'Thorax')
for L in legs:
    add_bone('Leg_' + L['name'] + '_Upper', L['hip'], L['knee'], 'Thorax')
    add_bone('Leg_' + L['name'] + '_Lower', L['knee'], L['foot'], 'Leg_' + L['name'] + '_Upper')
bpy.ops.object.mode_set(mode='OBJECT')

def seg_dist(P, a, b):
    d = b - a; t = np.clip(((P - a) @ d) / (d @ d), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * d), axis=1), t
N = len(verts)
d_up = np.empty((N, 6)); d_lo = np.empty((N, 6)); t_up = np.empty((N, 6)); d_hip = np.empty((N, 6))
for i, L in enumerate(legs):
    d_up[:, i], t_up[:, i] = seg_dist(verts, L['hip'], L['knee']); d_lo[:, i], _ = seg_dist(verts, L['knee'], L['foot'])
    d_hip[:, i] = np.linalg.norm(verts - L['hip'], axis=1)
d_leg = np.minimum(d_up, d_lo); near_i = np.argmin(d_leg, axis=1); dl = d_leg[np.arange(N), near_i]
groups = {}
for L in legs:
    for part in ('Upper', 'Lower'): groups[f"Leg_{L['name']}_{part}"] = mesh.vertex_groups.new(name=f"Leg_{L['name']}_{part}")
g_head = mesh.vertex_groups.new(name='Head'); g_thor = mesh.vertex_groups.new(name='Thorax'); g_abd = mesh.vertex_groups.new(name='Abdomen')
sm = lambda x: x * x * (3 - 2 * np.clip(x, 0, 1))
for vi in range(N):
    p = verts[vi]; i = near_i[vi]
    lw = float(sm((0.105 - dl[vi]) / 0.03)) * float(np.clip((d_hip[vi, i] - 0.05) / 0.15, 0, 1))      # perna: some perto do quadril (aí manda o tórax)
    if lw > 1e-3:
        wl = float(np.clip(0.5 + (d_up[vi, i] - d_lo[vi, i]) / 0.12, 0, 1))
        if lw * (1 - wl) > 1e-3: groups[f"Leg_{legs[i]['name']}_Upper"].add([vi], lw * (1 - wl), 'REPLACE')
        if lw * wl > 1e-3: groups[f"Leg_{legs[i]['name']}_Lower"].add([vi], lw * wl, 'REPLACE')
    rest = 1 - lw
    if rest > 1e-3:
        x = -p[1]                                                  # eixo do corpo (cabeça em -X antes da rotação; depois da rotação é -Y)
        # depois da rotação (x', y') = (-y, x): o comprimento do corpo está em y' = x_original
        x = p[1]
        wh = float(sm((-0.10 - x) / 0.34)); wa = float(sm((x + 0.02) / 0.34)); wt = max(0.0, 1 - wh - wa)
        if wh * rest > 1e-3: g_head.add([vi], wh * rest, 'REPLACE')
        if wt * rest > 1e-3: g_thor.add([vi], wt * rest, 'REPLACE')
        if wa * rest > 1e-3: g_abd.add([vi], wa * rest, 'REPLACE')
mod = mesh.modifiers.new('Titan skin', 'ARMATURE'); mod.object = arm; mod.use_vertex_groups = True
mesh.parent = arm

# ───────────── 6. animações ─────────────
arm.animation_data_create()
def qaxis(axis, angle): return Quaternion(Vector(axis).normalized(), angle)
def local_for_world(pbone, qworld):
    rest = pbone.bone.matrix_local.to_3x3().to_quaternion()
    return rest.conjugated() @ qworld @ rest
def rot(bone, axis, deg):                          # rotação em eixo do MUNDO (acumula em quatérnios)
    pb = arm.pose.bones[bone]; pb.rotation_mode = 'QUATERNION'
    pb.rotation_quaternion = pb.rotation_quaternion @ local_for_world(pb, qaxis(axis, math.radians(deg))) if False else local_for_world(pb, qaxis(axis, math.radians(deg))) @ pb.rotation_quaternion
def rot_set(bone, axes):                           # várias rotações seguidas num osso
    pb = arm.pose.bones[bone]; pb.rotation_mode = 'QUATERNION'; q = Quaternion((1, 0, 0, 0))
    for axis, deg in axes: q = qaxis(axis, math.radians(deg)) @ q
    pb.rotation_quaternion = local_for_world(pb, q)
def move(bone, x=0, y=0, z=0):
    pb = arm.pose.bones[bone]; world = Vector((x, y, z)); rest = pb.bone.matrix_local.to_3x3()
    pb.location = rest.inverted() @ world
def reset_pose():
    for pb in arm.pose.bones: pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0); pb.scale = (1, 1, 1)
def key_all(frame):
    for pb in arm.pose.bones:
        pb.keyframe_insert(data_path='rotation_quaternion', frame=frame, group=pb.name); pb.keyframe_insert(data_path='location', frame=frame, group=pb.name)
def create_action(name, duration, pose_fn, loop=False):
    action = bpy.data.actions.new(name); action.use_fake_user = True; arm.animation_data.action = action
    n = round(duration * FPS)
    for f in range(1, n + 2):
        reset_pose(); pose_fn((f - 1) / n); key_all(f)
    return action
ssm = lambda a, b, u: float(np.clip((u - a) / (b - a), 0, 1)) ** 2 * (3 - 2 * float(np.clip((u - a) / (b - a), 0, 1)))
X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)                    # o corpo olha para -Y: "frente" = rotação negativa em torno de X levanta o pé para a frente
FRONT_PAIR = ('Leg_FL', 'Leg_FR'); GROUP_A = ('Leg_FL', 'Leg_MR', 'Leg_RL'); GROUP_B = ('Leg_FR', 'Leg_ML', 'Leg_RR')

def idle_pose(u):
    w = 2 * math.pi * u
    move('Root', z=0.006 * math.sin(w))
    rot('Abdomen', X, 2.2 * math.sin(w)); rot('Head', X, 1.5 * math.sin(w + 0.8)); rot('Thorax', X, 0.8 * math.sin(w + 0.3))
    for i, L in enumerate(legs):
        ph = i * 0.9
        rot(f"Leg_{L['name']}_Upper", Z, 1.3 * math.sin(w + ph))

def step(u, name):                                          # u em radianos de fase do passo: lento e pesado
    F = -math.cos(u); lift = max(0.0, math.sin(u))
    rot(name + '_Upper', X, -13 * F - 5 * lift)             # balança para frente/trás
    rot(name + '_Lower', X, 20 * lift)                      # dobra o joelho para tirar o pé do chão
def walk_pose(u):
    w = 2 * math.pi * u
    for L in legs:
        nm = 'Leg_' + L['name']; ph = 0.0 if nm in GROUP_A else math.pi
        step(w + ph, nm)
    move('Root', z=0.012 * math.cos(2 * w), x=0.0)
    rot('Thorax', Z, 1.6 * math.sin(w)); rot('Thorax', Y, 1.2 * math.sin(w)); rot('Head', Z, -2.0 * math.sin(w)); rot('Abdomen', Z, -2.0 * math.sin(w))
    rot('Abdomen', X, 1.2 * math.sin(2 * w))

def stomp_pose(u):
    # 0-0.32 ergue o par da frente; 0.32-0.46 esmaga; 0.46-1 recupera. O impacto acontece em u = 0.46 (evento usado pelo jogo).
    up = ssm(0.0, 0.32, u) * (1 - ssm(0.32, 0.40, u)); slam = ssm(0.32, 0.46, u) * (1 - ssm(0.46, 0.80, u))
    rear = ssm(0.0, 0.3, u) * (1 - ssm(0.46, 0.9, u))
    for nm in FRONT_PAIR:
        rot(nm + '_Upper', X, -40 * up + 8 * slam); rot(nm + '_Lower', X, 56 * up - 10 * slam)
    move('Root', z=-0.03 * slam - 0.015 * rear, y=-0.05 * slam)
    rot('Thorax', X, 5 * up - 4 * slam); rot('Head', X, -2 * up + 6 * slam); rot('Abdomen', X, -3 * up + 3 * slam)
    for nm in ('Leg_ML', 'Leg_MR', 'Leg_RL', 'Leg_RR'):
        rot(nm + '_Upper', X, 5 * rear - 4 * slam)

def jet_pose(u):
    # 0-0.22 recua e ergue a cabeça; 0.22-0.34 empurra para a frente; 0.34-0.84 jorra (leve tremor); 0.84-1 recupera. Jato ativo entre 0.34 e 0.84.
    rear = ssm(0.0, 0.22, u) * (1 - ssm(0.22, 0.34, u)); fwd = ssm(0.22, 0.34, u) * (1 - ssm(0.84, 1.0, u))
    shake = math.sin(u * 2 * math.pi * 14) * (1 if 0.34 < u < 0.84 else 0) * 0.8
    rot('Head', X, 26 * rear - 8 * fwd + shake); rot('Thorax', X, -5 * rear + 3 * fwd); rot('Abdomen', X, 8 * rear - 6 * fwd + shake * 0.8)
    move('Root', z=-0.025 * fwd, y=0.02 * rear - 0.02 * fwd)
    for L in legs:
        nm = 'Leg_' + L['name']; rot(nm + '_Upper', X, (4 if L['front'] > 0 else -5) * fwd)
        if nm in FRONT_PAIR: rot(nm + '_Lower', X, 6 * fwd)

idle = create_action('Idle', 3.0, idle_pose, True)
walk = create_action('Walk', 2.0, walk_pose, True)
stomp = create_action('Stomp', 1.8, stomp_pose, False)
jet = create_action('Jet', 2.4, jet_pose, False)
scene = bpy.context.scene; scene.render.fps = FPS; scene.frame_start = 1; scene.frame_end = round(3.0 * FPS) + 1
arm.animation_data.action = idle

# ───────────── 7. exportação ─────────────
for image in bpy.data.images:
    try: image.pack()
    except Exception: pass
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); mesh.select_set(True); bpy.context.view_layer.objects.active = arm
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.export_scene.gltf(filepath=os.path.normpath(OUT_GLB), export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='ACTIONS',
    export_skins=True, export_materials='EXPORT', export_yup=True, export_apply=True, export_optimize_animation_size=False, export_force_sampling=True)
print('Salvo', OUT_BLEND, OUT_GLB)

# ───────────── 8. prévia: quadros de cada ação ─────────────
if DO_PREVIEW:
    scene.render.engine = 'BLENDER_EEVEE'; scene.render.resolution_x = 480; scene.render.resolution_y = 480
    scene.view_settings.view_transform = 'Standard'; scene.render.film_transparent = False
    world = bpy.data.worlds.new('w'); world.use_nodes = True; world.node_tree.nodes['Background'].inputs[0].default_value = (0.35, 0.37, 0.42, 1); scene.world = world
    center = Vector((0, 0, 0.42))
    for lname, loc, power in [('Key', (2.2, -2.5, 2.5), 1100), ('Fill', (-2.5, -1.5, 1.4), 500), ('Top', (0, 0, 3.2), 600)]:
        d = bpy.data.lights.new(lname, 'AREA'); d.energy = power; d.size = 3; ob = bpy.data.objects.new(lname, d); scene.collection.objects.link(ob); ob.location = center + Vector(loc)
        ob.rotation_euler = (center - ob.location).to_track_quat('-Z', 'Y').to_euler()
    camd = bpy.data.cameras.new('c'); cam = bpy.data.objects.new('c', camd); scene.collection.objects.link(cam); scene.camera = cam; camd.type = 'ORTHO'; camd.ortho_scale = 1.55
    cam.location = center + Vector((1.0, -1.0, 0.45)).normalized() * 4; cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    for act, dur, marks in [(idle, 3.0, [0, 0.5]), (walk, 2.0, [0, 0.25, 0.5, 0.75]), (stomp, 1.8, [0.0, 0.3, 0.46, 0.7]), (jet, 2.4, [0.0, 0.2, 0.5, 0.9])]:
        arm.animation_data.action = act
        for k, m in enumerate(marks):
            scene.frame_set(1 + round(m * dur * FPS)); scene.render.filepath = os.path.join(PREV, f'titan_{act.name}_{k}.png'); bpy.ops.render.render(write_still=True)
    print('Prévias salvas')
