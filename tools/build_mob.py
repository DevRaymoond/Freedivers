"""Rig e animações de aranha para os mobs do Tripo (FBX sem rig): corredor (rastejador) e empurrador (investidor).
   blender --background --factory-startup --python tools/build_mob.py -- crawler|pusher [preview]
   Saídas: assets/<nome>.blend, assets/<nome>.glb (depois rode tools/shrink_glb.py assets/<nome>.glb), tools/preview/<nome>_*.png

   Os dois olham para -Y (sai olhando para +Z no GLB, como a aranha). As pernas foram medidas na malha (ver tools/validar_modelos.md):
     crawler (mA): 4 pares de pernas, a 3ª da esquerda está levantada no modelo (pose); corpo de lagarta em 5 segmentos que ondulam ao andar;
     pusher  (mB): 3 pares de pernas em pilares, placa de pedra no dorso e dois chifres; andar em trípode.
   Ações: Idle, Walk (marcha alternada), e a ação de combate de cada um (Attack no corredor; Wind, Charge e Stun no empurrador)."""
import bpy, bmesh, os, sys, glob, math
import numpy as np
from mathutils import Vector, Quaternion

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
KIND = ARGS[0] if ARGS else 'crawler'
DO_PREVIEW = 'preview' in ARGS
FPS = 24
PREV = os.path.join(ROOT, 'tools', 'preview'); os.makedirs(PREV, exist_ok=True)
CFG = {
    'crawler': dict(src='mA', ratio=0.16, leg_r=0.058, fade=0.07),
    'pusher': dict(src='mB', ratio=0.20, leg_r=0.075, fade=0.07),
    'bomber': dict(src='bomber', ratio=0.24, leg_r=0.05, fade=0.03),
}[KIND]
SRC = glob.glob(os.path.join(ROOT, 'tools', 'source', CFG['src'], '*.fbx'))[0]
OUT_BLEND = os.path.join(ROOT, 'assets', KIND + '.blend'); OUT_GLB = os.path.join(ROOT, 'assets', KIND + '.glb')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SRC, automatic_bone_orientation=True)
for o in list(bpy.context.scene.objects):
    if o.type != 'MESH': bpy.data.objects.remove(o, do_unlink=True)
mesh = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
mesh.name = KIND.capitalize() + 'Mesh'; mesh.data.name = KIND.capitalize() + 'Geometry'
bpy.context.view_layer.objects.active = mesh; mesh.select_set(True)
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
mesh.location = (0, 0, 0)
if KIND == 'bomber':                                 # a formiga vem com a cabeça em +X; o jogo quer -Y
    mesh.rotation_euler = (0, 0, -math.pi / 2); bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)

# ───────────── 1. malha: redução e faces chapadas ─────────────
before = len(mesh.data.vertices)
dec = mesh.modifiers.new('Decimate', 'DECIMATE'); dec.decimate_type = 'COLLAPSE'; dec.ratio = CFG['ratio']
bpy.ops.object.modifier_apply(modifier=dec.name)
for p in mesh.data.polygons: p.use_smooth = False
print('Vértices:', before, '->', len(mesh.data.vertices))

# ───────────── 2. olhos brilhantes (material emissivo próprio nas faces de cor viva da textura) ─────────────
base_mat = mesh.data.materials[0]; base_mat.name = KIND + ' | PBR'
tex = next((n.image for n in base_mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image and 'color' in os.path.basename(n.image.filepath).lower()), None)
if KIND == 'crawler':
    is_glow = lambda r, g, b: r > 0.85 and 0.3 < g < 0.75 and b < 0.25; glow_col = (1.0, 0.45, 0.05, 1.0)
elif KIND == 'bomber':
    is_glow = lambda r, g, b: r > 0.9 and g > 0.5 and b < 0.4; glow_col = (1.0, 0.6, 0.08, 1.0)     # abdômen e olhos amarelos
else:
    is_glow = lambda r, g, b: b > 0.75 and g > 0.6 and r < 0.35; glow_col = (0.2, 0.85, 1.0, 1.0)
glow = base_mat.copy(); glow.name = KIND + ' | Olhos'
gb = glow.node_tree.nodes.get('Principled BSDF'); gb.inputs['Emission Color'].default_value = glow_col; gb.inputs['Emission Strength'].default_value = 0.8 if KIND == 'bomber' else 1.6
mesh.data.materials.append(glow)
if tex:
    w, h = tex.size; px = np.array(tex.pixels[:], dtype=np.float32).reshape(h, w, 4); uv = mesh.data.uv_layers.active.data; n_glow = 0
    for poly in mesh.data.polygons:
        u = np.mean([uv[l].uv[0] for l in poly.loop_indices]); v_ = np.mean([uv[l].uv[1] for l in poly.loop_indices])
        r, g, b = px[min(h - 1, max(0, int(v_ * h))), min(w - 1, max(0, int(u * w)))][:3]
        if is_glow(r, g, b): poly.material_index = 1; n_glow += 1
    print('Faces dos olhos:', n_glow)

verts = np.asarray([v.co[:] for v in mesh.data.vertices], dtype=np.float64)

# ───────────── 3. esqueleto ─────────────
# perna = (nome, quadril, joelho, pé) em coordenadas do mundo; lado = +1 em x>0
def mk(name, hx, y, hz, kx, kz, fx, fz, fy=None, ky=None):
    s = 1 if fx > 0 else -1
    return dict(name=name, hip=np.array([hx, y, hz]), knee=np.array([kx, y if ky is None else ky, kz]), foot=np.array([fx, y if fy is None else fy, fz]), side=s)
if KIND == 'crawler':
    PAIRS = [('F', -0.425, 0.17, 0.115, 0.075, 0.20, 0.0), ('MF', -0.258, 0.19, 0.115, 0.095, 0.21, 0.0), ('MR', -0.05, 0.215, 0.115, 0.095, 0.205, 0.0), ('R', 0.187, 0.19, 0.115, 0.1, 0.19, 0.0)]
    legs = []
    for nm, y, hz, hx, kz, kx, fz in PAIRS:
        for s in (1, -1):
            hz_ = hz
            legs.append(mk(f'Leg_{nm}_{"R" if s > 0 else "L"}', s * hx, y, hz_, s * (kx - 0.055), kz + 0.01, s * kx + s * 0.0, fz))
    for L in legs:                                   # pé na esquerda da 3ª perna: no modelo está levantado; o osso fica na pose de repouso (apoiada)
        pass
    bone_of_y = lambda y: 'Head' if y < -0.33 else 'S1' if y < -0.15 else 'S2' if y < 0.05 else 'S3'
    SPINE = [('Head', -0.49, -0.30, 0.20), ('S1', -0.33, -0.15, 0.20), ('S2', -0.15, 0.05, 0.20), ('S3', 0.05, 0.27, 0.20), ('S4', 0.27, 0.50, 0.20)]
    CENTERS = {'Head': -0.43, 'S1': -0.24, 'S2': -0.05, 'S3': 0.16, 'S4': 0.38}
elif KIND == 'bomber':
    T = lambda p: np.array([p[1], -p[0], p[2]])      # mesma rotação aplicada à malha (cabeça de +X para -Y)
    RAW = [('F_R', (0.26, 0.137, 0.30), (0.316, 0.18, 0.148), (0.363, 0.216, 0.0), 1), ('M_R', (0.0225, 0.22, 0.30), (-0.048, 0.244, 0.148), (-0.099, 0.261, 0.0), 1), ('R_R', (-0.12, 0.195, 0.30), (-0.22, 0.166, 0.148), (-0.292, 0.145, 0.0), 1),
           ('F_L', (0.20, -0.134, 0.30), (0.29, -0.182, 0.148), (0.354, -0.217, 0.0), -1), ('M_L', (0.08, -0.19, 0.30), (0.087, -0.267, 0.148), (0.094, -0.322, 0.0), -1), ('R_L', (-0.127, -0.235, 0.30), (-0.164, -0.293, 0.148), (-0.191, -0.335, 0.0), -1)]
    legs = [dict(name='Leg_' + n, hip=T(h), knee=T(k), foot=T(f), side=1 if T(f)[0] > 0 else -1) for n, h, k, f, _ in RAW]
else:
    ys = {1: [-0.118, 0.138, 0.361], -1: [-0.163, 0.10, 0.337]}
    legs = []
    for i, nm in enumerate(('F', 'M', 'R')):
        for s in (1, -1):
            y = ys[s][i]
            legs.append(dict(name=f'Leg_{nm}_{"R" if s > 0 else "L"}', hip=np.array([s * 0.23, y, 0.27]), knee=np.array([s * 0.30, y, 0.12]), foot=np.array([s * 0.385, y, 0.0]), side=s))
arm_data = bpy.data.armatures.new(KIND + 'Rig'); arm = bpy.data.objects.new(KIND + 'Rig', arm_data)
bpy.context.collection.objects.link(arm); bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
def add_bone(name, head, tail, parent=None):
    b = arm_data.edit_bones.new(name); b.head = head; b.tail = tail
    if parent: b.parent = arm_data.edit_bones[parent]
    return b
add_bone('Root', (0, 0, 0), (0, 0, 0.1))
if KIND == 'crawler':
    add_bone('S2', (0, -0.15, 0.20), (0, 0.05, 0.20), 'Root')
    add_bone('S1', (0, -0.33, 0.20), (0, -0.15, 0.20), 'S2'); add_bone('Head', (0, -0.49, 0.20), (0, -0.33, 0.20), 'S1')
    add_bone('S3', (0, 0.05, 0.20), (0, 0.27, 0.20), 'S2'); add_bone('S4', (0, 0.27, 0.20), (0, 0.50, 0.20), 'S3')
    for L in legs: L['parent'] = bone_of_y(L['hip'][1])
elif KIND == 'bomber':
    add_bone('Thorax', (0, 0.1, 0.33), (0, -0.1, 0.33), 'Root')
    add_bone('Head', (0, -0.28, 0.30), (0, -0.48, 0.30), 'Thorax')
    add_bone('Abdomen', (0, 0.12, 0.42), (0, 0.45, 0.45), 'Thorax')
    for L in legs: L['parent'] = 'Thorax'
else:
    add_bone('Thorax', (0, 0.0, 0.22), (0, 0.3, 0.22), 'Root')
    add_bone('Head', (0, -0.2, 0.2), (0, -0.49, 0.2), 'Thorax')
    add_bone('Plate', (0, -0.05, 0.36), (0, 0.25, 0.36), 'Thorax')
    for L in legs: L['parent'] = 'Thorax'
for L in legs:
    add_bone(L['name'] + '_Upper', L['hip'], L['knee'], L['parent']); add_bone(L['name'] + '_Lower', L['knee'], L['foot'], L['name'] + '_Upper')
bpy.ops.object.mode_set(mode='OBJECT')

def seg_dist(P, a, b):
    d = b - a; t = np.clip(((P - a) @ d) / (d @ d), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * d), axis=1)
N = len(verts); NL = len(legs)
d_up = np.empty((N, NL)); d_lo = np.empty((N, NL)); d_hip = np.empty((N, NL))
for i, L in enumerate(legs):
    d_up[:, i] = seg_dist(verts, L['hip'], L['knee']); d_lo[:, i] = seg_dist(verts, L['knee'], L['foot']); d_hip[:, i] = np.linalg.norm(verts - L['hip'], axis=1)
d_leg = np.minimum(d_up, d_lo); near_i = np.argmin(d_leg, axis=1); dl = d_leg[np.arange(N), near_i]
groups = {}
for L in legs:
    for part in ('Upper', 'Lower'): groups[f"{L['name']}_{part}"] = mesh.vertex_groups.new(name=f"{L['name']}_{part}")
body_names = ['Head', 'S1', 'S2', 'S3', 'S4'] if KIND == 'crawler' else ['Thorax', 'Head', 'Abdomen'] if KIND == 'bomber' else ['Thorax', 'Head', 'Plate']
for bn in body_names: groups[bn] = mesh.vertex_groups.new(name=bn)
sm = lambda x: float(x * x * (3 - 2 * np.clip(x, 0, 1))) if False else float(np.clip(x, 0, 1) ** 2 * (3 - 2 * np.clip(x, 0, 1)))
for vi in range(N):
    p = verts[vi]; i = near_i[vi]; L = legs[i]
    lw = sm((CFG['leg_r'] - dl[vi]) / CFG['fade']) * float(np.clip((d_hip[vi, i] - 0.05) / 0.12, 0, 1))      # perna: perto do quadril manda o corpo
    if lw > 1e-3:
        wl = float(np.clip(0.5 + (d_up[vi, i] - d_lo[vi, i]) / 0.10, 0, 1))
        if lw * (1 - wl) > 1e-3: groups[L['name'] + '_Upper'].add([vi], lw * (1 - wl), 'REPLACE')
        if lw * wl > 1e-3: groups[L['name'] + '_Lower'].add([vi], lw * wl, 'REPLACE')
    rest = 1 - lw
    if rest <= 1e-3: continue
    if KIND == 'crawler':
        ws = {k: max(0.0, 1 - abs(p[1] - c) / 0.2) for k, c in CENTERS.items()}
        if p[1] < CENTERS['Head']: ws['Head'] = 1.0
        if p[1] > CENTERS['S4']: ws['S4'] = 1.0
        tot = sum(ws.values()) or 1.0
        for k, w_ in ws.items():
            if w_ > 1e-3: groups[k].add([vi], rest * w_ / tot, 'REPLACE')
    elif KIND == 'bomber':                                    # cabeça em -Y, abdômen em +Y
        wh = sm((-p[1] - 0.26) / 0.10); wa = sm((p[1] - 0.06) / 0.14) * (1 - wh); wt = max(0.0, 1 - wh - wa)
        for k, w_ in (('Head', wh), ('Abdomen', wa), ('Thorax', wt)):
            if w_ * rest > 1e-3: groups[k].add([vi], w_ * rest, 'REPLACE')
    else:
        wp = sm((p[2] - 0.31) / 0.07) * (1.0 if p[1] > -0.34 else sm((p[1] + 0.46) / 0.12)); wh = sm((-p[1] - 0.16) / 0.2) * (1 - wp); wt = max(0.0, 1 - wp - wh)
        for k, w_ in (('Plate', wp), ('Head', wh), ('Thorax', wt)):
            if w_ * rest > 1e-3: groups[k].add([vi], w_ * rest, 'REPLACE')
mod = mesh.modifiers.new(KIND + ' skin', 'ARMATURE'); mod.object = arm; mod.use_vertex_groups = True
mesh.parent = arm

# ───────────── 4. animações ─────────────
arm.animation_data_create()
def qaxis(axis, angle): return Quaternion(Vector(axis).normalized(), angle)
def local_for_world(pbone, qworld):
    rest = pbone.bone.matrix_local.to_3x3().to_quaternion()
    return rest.conjugated() @ qworld @ rest
def rot(bone, axis, deg):
    pb = arm.pose.bones[bone]; pb.rotation_mode = 'QUATERNION'
    pb.rotation_quaternion = local_for_world(pb, qaxis(axis, math.radians(deg))) @ pb.rotation_quaternion
def move(bone, x=0, y=0, z=0):
    pb = arm.pose.bones[bone]; pb.location = pb.bone.matrix_local.to_3x3().inverted() @ Vector((x, y, z))
def grow(bone, k):
    pb = arm.pose.bones[bone]; pb.scale = (1 + k, 1 + k, 1 + k)
def reset_pose():
    for pb in arm.pose.bones: pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0); pb.scale = (1, 1, 1)
def key_all(frame):
    for pb in arm.pose.bones:
        pb.keyframe_insert(data_path='rotation_quaternion', frame=frame, group=pb.name); pb.keyframe_insert(data_path='location', frame=frame, group=pb.name); pb.keyframe_insert(data_path='scale', frame=frame, group=pb.name)
def create_action(name, duration, pose_fn, loop=False):
    action = bpy.data.actions.new(name); action.use_fake_user = True; arm.animation_data.action = action
    n = round(duration * FPS)
    for f in range(1, n + 2):
        reset_pose(); pose_fn((f - 1) / n); key_all(f)
    return action
X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)
ssm = lambda a, b, u: float(np.clip((u - a) / (b - a), 0, 1)) ** 2 * (3 - 2 * float(np.clip((u - a) / (b - a), 0, 1)))
def swing(L, fwd_deg):                 # balança o pé para a frente (-Y) e para trás: rotação vertical (Z)
    rot(L['name'] + '_Upper', Z, -L['side'] * fwd_deg)
def lift(L, deg):                      # ergue o pé: as pernas saem para o lado, então o giro é em torno de Y
    rot(L['name'] + '_Upper', Y, -L['side'] * deg); rot(L['name'] + '_Lower', Y, -L['side'] * deg * 0.9)
def step(L, u, amp, hgt):              # passo: no ar o pé vai para frente, no chão volta devagar
    swing(L, amp * -math.cos(u)); lift(L, hgt * max(0.0, math.sin(u)))
LEGS_BY_NAME = {L['name']: L for L in legs}
def gait_phase(L):
    if KIND == 'crawler':               # marcha alternada: pares cruzados em oposição
        i = ['F', 'MF', 'MR', 'R'].index(L['name'].split('_')[1]); return math.pi * ((i + (0 if L['side'] > 0 else 1)) % 2)
    i = ['F', 'M', 'R'].index(L['name'].split('_')[1]) if KIND == 'pusher' else ['F', 'M', 'R'].index(L['name'].split('_')[1]); return math.pi * ((i + (0 if L['side'] > 0 else 1)) % 2)      # trípode

if KIND == 'crawler':
    def idle_pose(u):
        w = 2 * math.pi * u
        move('Root', z=0.004 * math.sin(w))
        for k, ph in (('S1', 0.3), ('S2', 0.6), ('S3', 0.9), ('S4', 1.2)): rot(k, Z, 1.6 * math.sin(w + ph))
        rot('Head', X, 1.5 * math.sin(w + 0.4))
        for i, L in enumerate(legs): rot(L['name'] + '_Upper', Z, 1.2 * math.sin(w + i))
    def walk_pose(u):
        w = 2 * math.pi * u
        for L in legs: step(L, w + gait_phase(L), 17, 20)
        move('Root', z=0.008 * math.cos(2 * w))
        for k, ph in (('Head', 0.0), ('S1', 0.5), ('S2', 1.0), ('S3', 1.5), ('S4', 2.0)): rot(k, Z, 5.0 * math.sin(w - ph))      # onda de lagarta pelo corpo
        rot('Head', X, 2.0 * math.sin(2 * w))
    def attack_pose(u):                # recua o corpo, empina e investe com a cabeça (impacto em u = 0.45)
        back = ssm(0.0, 0.3, u) * (1 - ssm(0.3, 0.45, u)); hit = ssm(0.3, 0.45, u) * (1 - ssm(0.45, 0.8, u))
        rot('Head', X, 20 * back - 24 * hit); rot('S1', X, 8 * back - 10 * hit); rot('S2', X, 5 * back - 3 * hit); move('Root', y=0.06 * back - 0.11 * hit, z=0.02 * back - 0.015 * hit)
        for L in legs:
            if L['name'].startswith('Leg_F_'): swing(L, 10 * back - 12 * hit)
    ACTIONS = [('Idle', 2.4, idle_pose, True), ('Walk', 0.7, walk_pose, True), ('Attack', 0.8, attack_pose, False)]
elif KIND == 'bomber':
    def idle_pose(u):
        w = 2 * math.pi * u
        move('Root', z=0.004 * math.sin(w)); grow('Abdomen', 0.025 * math.sin(w)); rot('Head', Z, 4 * math.sin(w * 0.5)); rot('Head', X, 2 * math.sin(w + 0.6))
        for i, L in enumerate(legs): rot(L['name'] + '_Upper', Z, 1.2 * math.sin(w + i))
    def walk_pose(u):
        w = 2 * math.pi * u
        for L in legs: step(L, w + gait_phase(L), 20, 24)
        move('Root', z=0.008 * math.cos(2 * w)); rot('Thorax', Z, 2 * math.sin(w)); rot('Abdomen', Z, -3 * math.sin(w)); rot('Abdomen', X, 2 * math.sin(2 * w)); grow('Abdomen', 0.02 * math.sin(2 * w))
    def swell_pose(u):                 # prestes a explodir: agacha, treme e o abdômen incha e pulsa (loop curto)
        w = 2 * math.pi * u
        move('Root', z=-0.035, x=0.008 * math.sin(w * 6)); grow('Abdomen', 0.18 + 0.07 * math.sin(w * 2)); rot('Head', X, -8); rot('Thorax', X, -3)
        for L in legs: rot(L['name'] + '_Upper', Y, L['side'] * 7); rot(L['name'] + '_Lower', Y, L['side'] * 5)
    ACTIONS = [('Idle', 2.0, idle_pose, True), ('Walk', 0.6, walk_pose, True), ('Swell', 0.5, swell_pose, True)]
else:
    def idle_pose(u):
        w = 2 * math.pi * u
        move('Root', z=0.004 * math.sin(w)); rot('Plate', X, 1.2 * math.sin(w + 0.5)); rot('Head', Z, 5 * math.sin(w * 0.5)); rot('Head', X, 1.5 * math.sin(w))
        for i, L in enumerate(legs): rot(L['name'] + '_Upper', Z, 1.0 * math.sin(w + i))
    def walk_pose(u):
        w = 2 * math.pi * u
        for L in legs: step(L, w + gait_phase(L), 14, 18)
        move('Root', z=0.007 * math.cos(2 * w)); rot('Thorax', Z, 1.5 * math.sin(w)); rot('Head', Z, -3 * math.sin(w)); rot('Plate', X, 1.0 * math.sin(2 * w))
    def wind_pose(u):                  # agacha, recua e treme antes da investida (loop curto)
        w = 2 * math.pi * u
        move('Root', z=-0.05, y=0.04); rot('Head', X, -10); rot('Thorax', X, -4); rot('Plate', X, 3)
        for L in legs: rot(L['name'] + '_Upper', Y, L['side'] * 6); rot(L['name'] + '_Lower', Y, L['side'] * 6)
        move('Root', x=0.012 * math.sin(w * 8))
    def charge_pose(u):                # corrida: passos curtos e rápidos, corpo baixo e chifres para a frente
        w = 2 * math.pi * u
        for L in legs: step(L, w + gait_phase(L), 20, 22)
        move('Root', z=-0.03 + 0.012 * math.cos(2 * w)); rot('Head', X, 10); rot('Thorax', X, 4); rot('Plate', X, -2)
    def stun_pose(u):                  # atordoado: cabeça baixa, pernas abertas, balanço lento
        w = 2 * math.pi * u
        move('Root', z=-0.06); rot('Head', X, 22 + 3 * math.sin(w)); rot('Plate', X, 4); rot('Thorax', Z, 2 * math.sin(w))
        for L in legs: rot(L['name'] + '_Upper', Y, L['side'] * -5)
    ACTIONS = [('Idle', 2.4, idle_pose, True), ('Walk', 0.8, walk_pose, True), ('Wind', 0.4, wind_pose, True), ('Charge', 0.45, charge_pose, True), ('Stun', 1.6, stun_pose, True)]
acts = {}
for name, dur, fn, lp in ACTIONS: acts[name] = create_action(name, dur, fn, lp)
scene = bpy.context.scene; scene.render.fps = FPS; scene.frame_start = 1; scene.frame_end = round(2.4 * FPS) + 1
arm.animation_data.action = acts['Idle']

# ───────────── 5. exportação ─────────────
for image in bpy.data.images:
    try: image.pack()
    except Exception: pass
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); mesh.select_set(True); bpy.context.view_layer.objects.active = arm
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.export_scene.gltf(filepath=os.path.normpath(OUT_GLB), export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='ACTIONS',
    export_skins=True, export_materials='EXPORT', export_yup=True, export_apply=True, export_optimize_animation_size=False, export_force_sampling=True)
print('Salvo', OUT_BLEND, OUT_GLB)

# ───────────── 6. prévia ─────────────
if DO_PREVIEW:
    scene.render.engine = 'BLENDER_EEVEE'; scene.render.resolution_x = 480; scene.render.resolution_y = 480
    scene.view_settings.view_transform = 'Standard'; scene.render.film_transparent = False
    world = bpy.data.worlds.new('w'); world.use_nodes = True; world.node_tree.nodes['Background'].inputs[0].default_value = (0.35, 0.37, 0.42, 1); scene.world = world
    center = Vector((0, 0, 0.2))
    for lname, loc, power in [('Key', (2.2, -2.5, 2.5), 900), ('Fill', (-2.5, -1.5, 1.4), 400), ('Top', (0, 0, 3.2), 500)]:
        d = bpy.data.lights.new(lname, 'AREA'); d.energy = power; d.size = 3; ob = bpy.data.objects.new(lname, d); scene.collection.objects.link(ob); ob.location = center + Vector(loc)
        ob.rotation_euler = (center - ob.location).to_track_quat('-Z', 'Y').to_euler()
    camd = bpy.data.cameras.new('c'); cam = bpy.data.objects.new('c', camd); scene.collection.objects.link(cam); scene.camera = cam; camd.type = 'ORTHO'; camd.ortho_scale = 1.35
    cam.location = center + Vector((1.0, -1.0, 0.45)).normalized() * 4; cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    for name, dur, fn, lp in ACTIONS:
        arm.animation_data.action = acts[name]
        for k, m in enumerate([0, 0.25, 0.5, 0.75] if name in ('Walk', 'Charge') else [0, 0.5] if name in ('Idle', 'Stun', 'Wind') else [0, 0.3, 0.45, 0.7]):
            scene.frame_set(1 + round(m * dur * FPS)); scene.render.filepath = os.path.join(PREV, f'{KIND}_{name}_{k}.png'); bpy.ops.render.render(write_still=True)
    print('Prévias salvas')
