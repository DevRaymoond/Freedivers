"""Retopologia (decimação quadrática) + rig + animações do personagem Freedivers.

Entrada : rugged character 3d model.glb (malha estática, 50k triângulos, sem rig)
Saída   : ../assets/character.glb (malha leve, esqueleto de 17 ossos, animações)
"""
import sys, math, json
import numpy as np
import trimesh
import fast_simplification
from pygltflib import (GLTF2, Scene, Node, Mesh, Primitive, Attributes, Skin, Buffer, BufferView,
                       Accessor, Animation, AnimationSampler, AnimationChannel, AnimationChannelTarget,
                       Material, PbrMetallicRoughness, Asset)

SRC = sys.argv[1]
OUT = sys.argv[2]
TARGET_TRIS = int(sys.argv[3]) if len(sys.argv) > 3 else 8000
HEIGHT = 1.8          # altura final do personagem em metros
FPS = 30

# ───────────── 1. Retopologia ─────────────
mesh = trimesh.load(SRC, force='mesh', process=True)   # funde vértices por posição
mesh.merge_vertices()
mesh.update_faces(mesh.nondegenerate_faces())
mesh.remove_unreferenced_vertices()
pts = np.asarray(mesh.vertices, dtype=np.float64)
faces = np.asarray(mesh.faces, dtype=np.int64)
import pymeshlab, os, tempfile
tmp = os.path.join(tempfile.gettempdir(), 'fd_retopo_in.ply')
trimesh.Trimesh(pts, faces, process=False).export(tmp)
ms = pymeshlab.MeshSet()
ms.load_new_mesh(tmp)
# colapso de arestas por quádrica preservando bordas e normais (roupas/cabelo são cascas finas)
ms.meshing_decimation_quadric_edge_collapse(
    targetfacenum=TARGET_TRIS, preserveboundary=True, boundaryweight=3.0, preservenormal=True,
    preservetopology=False, optimalplacement=True, planarquadric=True, planarweight=0.002,
    qualitythr=0.6, autoclean=False)
cur = ms.current_mesh()
low = trimesh.Trimesh(cur.vertex_matrix(), cur.face_matrix(), process=False)
low.remove_unreferenced_vertices()
print(f'original: {len(faces)} tris / {len(pts)} verts  ->  retopo: {len(low.faces)} tris / {len(low.vertices)} verts')

V = np.asarray(low.vertices, dtype=np.float64)
V[:, 1] -= V[:, 1].min()          # pés no chão
F = np.asarray(low.faces, dtype=np.int64)

# ───────────── 2. Esqueleto (coordenadas do modelo original, altura 1.0) ─────────────
J = {}  # nome -> (pai, posição)
def j(name, parent, x, y, z=0.0): J[name] = (parent, np.array([x, y, z]))
j('Hips', None, 0, .54)
j('Spine', 'Hips', 0, .62)
j('Chest', 'Spine', 0, .72)
j('Neck', 'Chest', 0, .83)
j('Head', 'Neck', 0, .88)
for side, s in (('L', 1), ('R', -1)):
    j(f'UpperArm_{side}', 'Chest', s * .10, .79)
    j(f'LowerArm_{side}', f'UpperArm_{side}', s * .17, .65)
    j(f'Hand_{side}', f'LowerArm_{side}', s * .17, .52)
    j(f'UpperLeg_{side}', 'Hips', s * .05, .52)
    j(f'LowerLeg_{side}', f'UpperLeg_{side}', s * .055, .30)
    j(f'Foot_{side}', f'LowerLeg_{side}', s * .055, .095)
NAMES = list(J.keys())
IDX = {n: i for i, n in enumerate(NAMES)}
TIPS = {'Head': np.array([0, 1.0, 0.0]), 'Hand_L': np.array([.17, .44, 0]), 'Hand_R': np.array([-.17, .44, 0]),
        'Foot_L': np.array([.055, 0, .10]), 'Foot_R': np.array([-.055, 0, .10])}

def seg_end(name):
    kids = [n for n in NAMES if J[n][0] == name]
    if kids:
        # segmento principal: filho da cadeia (primeiro filho que não seja braço quando for Chest)
        pref = [k for k in kids if k in ('Neck', 'Spine', 'Head') or k.startswith(('Lower', 'Hand', 'Foot'))]
        return J[(pref or kids)[0]][1]
    return TIPS[name]

# ───────────── 3. Pesos de skin ─────────────
def point_seg(p, a, b):
    ab = b - a
    t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(p - (a + t[:, None] * ab), axis=1)

# reescala o modelo para o espaço "altura 1.0" durante o cálculo (já está ~1.0)
scale_src = 1.0 / V[:, 1].max()
Vn = V * scale_src
W = np.zeros((len(Vn), len(NAMES)))
# Cascas pequenas e soltas (mãos, punhos, botas, bolsos, fivelas) seguem um osso só
labels = trimesh.graph.connected_components(low.edges_unique, nodes=np.arange(len(Vn)), min_len=1)
small = np.zeros(len(Vn), bool)
small_comps = []
for comp in labels:
    if len(comp) > 1800: continue
    if np.linalg.norm(Vn[comp].max(0) - Vn[comp].min(0)) > 0.32: continue
    small[comp] = True
    small_comps.append(comp)
for n in NAMES:
    a, b = J[n][1], seg_end(n)
    d = point_seg(Vn, a, b)
    w = 1.0 / (d + 0.012) ** 4
    x, y = Vn[:, 0], Vn[:, 1]
    if n.startswith(('UpperArm', 'LowerArm', 'Hand')):
        s = 1 if n.endswith('L') else -1
        w *= np.clip((np.abs(x) - np.where(y > 0.76, 0.07, 0.115)) / 0.04, 0.02, 1) * np.clip((x * s + 0.01) / 0.03, 0.02, 1) * \
             np.where(small, np.clip((y - 0.36) / 0.06, 0.02, 1), np.clip((y - 0.57) / 0.05, 0.02, 1))
    if n.startswith(('UpperLeg', 'LowerLeg', 'Foot')):
        s = 1 if n.endswith('L') else -1
        w *= np.clip((0.60 - y) / 0.1, 0.02, 1) * np.clip((x * s + 0.02) / 0.03, 0.02, 1)
    W[:, IDX[n]] = w
# Casaco/aba solta longe das pernas: acompanha o quadril em vez de ser esticado pelas pernas
dleg = np.min([point_seg(Vn, J[n][1], seg_end(n)) for n in NAMES if n.startswith(('UpperLeg', 'LowerLeg', 'Foot'))], axis=0)
coat = np.clip((dleg - 0.08) / 0.05, 0, 1) * np.clip((Vn[:, 1] - 0.20) / 0.08, 0, 1) * np.clip((0.62 - Vn[:, 1]) / 0.08, 0, 1)
leg_cols = [IDX[n] for n in NAMES if n.startswith(('UpperLeg', 'LowerLeg', 'Foot'))]
total = W.sum(1)
W[:, leg_cols] *= (1 - 0.9 * coat)[:, None]
W[:, IDX['Hips']] += coat * total * 0.9
# Peças pequenas e soltas (mãos, punhos, botas, bolsos, fivelas) seguem um osso só: pesos médios da peça inteira
for comp in small_comps:
    W[comp] = W[comp].mean(0)
top = np.argsort(-W, axis=1)[:, :4]
Wt = np.take_along_axis(W, top, 1)
Wt /= Wt.sum(1, keepdims=True)

# ───────────── 4. Escala final ─────────────
S = HEIGHT / V[:, 1].max()
Vf = V * S
JP = {n: J[n][1] * scale_src * S for n in NAMES}  # posições mundo dos ossos já em metros

# ───────────── 5. Animações ─────────────
def qx(d): h = math.radians(d) / 2; return np.array([math.sin(h), 0, 0, math.cos(h)])
def qy(d): h = math.radians(d) / 2; return np.array([0, math.sin(h), 0, math.cos(h)])
def qz(d): h = math.radians(d) / 2; return np.array([0, 0, math.sin(h), math.cos(h)])
def qmul(a, b):
    x1, y1, z1, w1 = a; x2, y2, z2, w2 = b
    return np.array([w1*x2 + x1*w2 + y1*z2 - z1*y2, w1*y2 - x1*z2 + y1*w2 + z1*x2,
                     w1*z2 + x1*y2 - y1*x2 + z1*w2, w1*w2 - x1*x2 - y1*y2 - z1*z2])
def rot(x=0, y=0, z=0):          # aplica Z, depois Y, depois X (no espaço do pai)
    return qmul(qx(x), qmul(qy(y), qz(z)))

IDQ = np.array([0, 0, 0, 1.0])
sm = lambda t: t * t * (3 - 2 * t)
def seg(t, a, b):                # rampa suave 0..1 entre a e b
    return sm(min(1, max(0, (t - a) / (b - a))))

# Pose de mira: ambas as mãos na arma, braços à frente
def aim_arms(p, breathe=0.0):
    # p[n] = (x, y, z) em graus
    p['UpperArm_R'] = (-68 + breathe, 0, 14)
    p['LowerArm_R'] = (-38, 0, 0)
    p['UpperArm_L'] = (-60 + breathe, 0, -22)
    p['LowerArm_L'] = (-62, 0, 0)
    p['Hand_L'] = (0, 0, 0)

def clip_idle(t, T):
    ph = 2 * math.pi * t / T
    p = {}; tr = {}
    aim_arms(p, breathe=1.5 * math.sin(ph))
    p['Chest'] = (1.5 * math.sin(ph), 0, 0)
    p['Head'] = (1.0 * math.sin(ph + .5), 3 * math.sin(ph * .5), 0)
    tr['Hips'] = (0, 0.006 * math.sin(ph), 0)
    return p, tr

def locomotion(t, T, leg, knee, arm_bob, lean, bob, aimed=True):
    ph = 2 * math.pi * t / T
    p = {}; tr = {}
    aim_arms(p, breathe=arm_bob * math.sin(2 * ph))
    p['UpperLeg_L'] = (-leg * math.sin(ph), 0, 0)
    p['UpperLeg_R'] = (leg * math.sin(ph), 0, 0)
    p['LowerLeg_L'] = (knee * max(0, math.cos(ph)), 0, 0)
    p['LowerLeg_R'] = (knee * max(0, -math.cos(ph)), 0, 0)
    p['Foot_L'] = (-0.3 * knee * max(0, math.cos(ph)), 0, 0)
    p['Foot_R'] = (-0.3 * knee * max(0, -math.cos(ph)), 0, 0)
    p['Spine'] = (lean, 4 * math.sin(ph), 0)
    p['Chest'] = (lean * .5, -4 * math.sin(ph), 0)
    tr['Hips'] = (0, bob * abs(math.sin(ph)), 0)
    return p, tr

def clip_walk(t, T): return locomotion(t, T, 28, 34, 1.2, 4, 0.025)
def clip_run(t, T): return locomotion(t, T, 42, 65, 2.0, 12, 0.05)

def clip_roll(t, T):
    u = t / T
    p = {}; tr = {}
    tuck = math.sin(math.pi * min(1, u * 1.1))
    p['Hips'] = (360 * sm(u), 0, 0)
    p['Spine'] = (40 * tuck, 0, 0)
    p['Chest'] = (25 * tuck, 0, 0)
    p['Head'] = (20 * tuck, 0, 0)
    p['UpperLeg_L'] = (-90 * tuck, 0, 0); p['UpperLeg_R'] = (-90 * tuck, 0, 0)
    p['LowerLeg_L'] = (110 * tuck, 0, 0); p['LowerLeg_R'] = (110 * tuck, 0, 0)
    p['UpperArm_L'] = (-60 * tuck, 0, -20 * tuck); p['UpperArm_R'] = (-60 * tuck, 0, 20 * tuck)
    p['LowerArm_L'] = (-80 * tuck, 0, 0); p['LowerArm_R'] = (-80 * tuck, 0, 0)
    tr['Hips'] = (0, -0.28 * math.sin(math.pi * u) * HEIGHT / 1.8, 0)
    return p, tr

def clip_reload(t, T):
    u = t / T
    p, tr = clip_idle(0, 1)
    out = seg(u, 0.05, 0.25) - seg(u, 0.75, 0.9)          # mão esquerda recua / volta
    slap = seg(u, 0.6, 0.7) - seg(u, 0.7, 0.8)            # encaixa o carregador
    p['UpperArm_L'] = (-60 + 45 * out + 8 * slap, 0, -22 - 8 * out)
    p['LowerArm_L'] = (-62 - 25 * out, 0, 0)
    p['Chest'] = (4 * out, -8 * out, 0)
    p['Head'] = (6 * out, -10 * out, 0)
    p['UpperArm_R'] = (-68 + 6 * out, 0, 14)
    return p, tr

def clip_shoot(t, T):
    u = t / T
    p, tr = clip_idle(0, 1)
    k = math.exp(-10 * u)                                   # coice decai rápido
    p['UpperArm_R'] = (-68 + 9 * k, 0, 14)
    p['UpperArm_L'] = (-60 + 9 * k, 0, -22)
    p['Chest'] = (-4 * k, 0, 0)
    p['Spine'] = (-3 * k, 0, 0)
    p['Head'] = (-2 * k, 0, 0)
    return p, tr

CLIPS = [  # nome, duração, função, loop
    ('Idle', 3.0, clip_idle, True),
    ('Walk', 1.0, clip_walk, True),
    ('Run', 0.7, clip_run, True),
    ('Roll', 0.5, clip_roll, False),
    ('Reload', 1.6, clip_reload, False),
    ('Shoot', 0.25, clip_shoot, False),
]

def sample(fn, T, loop):
    n = max(2, int(round(T * FPS)) + (0 if loop else 1))
    times, rots, trans = [], {k: [] for k in NAMES}, {k: [] for k in NAMES}
    for i in range(n):
        t = i / FPS if loop else min(T, i / FPS)
        pose, tr = fn(t, T)
        times.append(t)
        for k in NAMES:
            e = pose.get(k, (0, 0, 0))
            rots[k].append(rot(*e))
            d = tr.get(k)
            trans[k].append(JP[k] - (JP[J[k][0]] if J[k][0] else 0) + (np.array(d) if d else 0))
    # garante continuidade de sinal dos quaternions
    for k in NAMES:
        for i in range(1, n):
            if np.dot(rots[k][i], rots[k][i - 1]) < 0: rots[k][i] = -rots[k][i]
    return np.array(times, np.float32), {k: np.array(v, np.float32) for k, v in rots.items()}, \
        {k: np.array(v, np.float32) for k, v in trans.items()}

# ───────────── 6. Pré-visualização por skin em CPU (verificação) ─────────────
def qmat(q):
    x, y, z, w = q
    return np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                     [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                     [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])

def skin_pose(rots_i, trans_i):
    world = {}
    for n in NAMES:
        M = np.eye(4); M[:3, :3] = qmat(rots_i[n]); M[:3, 3] = trans_i[n]
        pn = J[n][0]
        world[n] = (world[pn] @ M) if pn else M
    out = np.zeros_like(Vf)
    vh = np.c_[Vf, np.ones(len(Vf))]
    for c in range(4):
        acc = np.zeros((len(Vf), 3))
        for n in NAMES:
            sel = top[:, c] == IDX[n]
            if not sel.any(): continue
            inv = np.eye(4); inv[:3, 3] = -JP[n]
            acc[sel] = (vh[sel] @ (world[n] @ inv).T)[:, :3]
        out += acc * Wt[:, c:c + 1]
    return out

if '--preview' in sys.argv:
    import matplotlib; matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    shots = [('Idle', .0), ('Walk', .25), ('Walk', .75), ('Run', .25), ('Roll', .5), ('Reload', .35)]
    fig, ax = plt.subplots(2, len(shots), figsize=(3 * len(shots), 9))
    bones = lambda w: None
    for i, (nm, u) in enumerate(shots):
        _, T, fn, loop = next(c for c in CLIPS if c[0] == nm)
        times, R, Tr = sample(fn, T, loop)
        k = int(u * (len(times) - 1))
        P = skin_pose({n: R[n][k] for n in NAMES}, {n: Tr[n][k] for n in NAMES})
        for r, (a_, b_) in enumerate(((0, 1), (2, 1))):
            ax[r][i].scatter(P[::3, a_], P[::3, b_], s=0.4, c='k'); ax[r][i].set_aspect('equal')
            ax[r][i].set_title(f'{nm} {u}'); ax[r][i].set_xlim(-1.2, 1.2); ax[r][i].set_ylim(-.3, 2.2)
    plt.tight_layout(); plt.savefig(OUT.replace('.glb', '_preview.png'), dpi=60)
    print('preview ok')

# ───────────── 7. Escrita do glTF ─────────────
g = GLTF2(asset=Asset(version='2.0', generator='Freedivers build_character.py'))
blob = bytearray()
def pad():
    while len(blob) % 4: blob.append(0)
def view(arr, target=None):
    pad()
    bv = BufferView(buffer=0, byteOffset=len(blob), byteLength=arr.nbytes, target=target)
    blob.extend(arr.tobytes()); g.bufferViews.append(bv); return len(g.bufferViews) - 1
def acc(arr, ctype, typ, target=None, minmax=False):
    bvi = view(arr, target)
    count = arr.shape[0]
    a = Accessor(bufferView=bvi, componentType=ctype, count=count, type=typ)
    if minmax:
        a.min = arr.reshape(count, -1).min(0).tolist(); a.max = arr.reshape(count, -1).max(0).tolist()
    g.accessors.append(a); return len(g.accessors) - 1

normals = trimesh.Trimesh(Vf, F, process=False).vertex_normals.astype(np.float32)
A_POS = acc(Vf.astype(np.float32), 5126, 'VEC3', 34962, True)
A_NOR = acc(normals, 5126, 'VEC3', 34962)
A_JNT = acc(top.astype(np.uint8), 5121, 'VEC4', 34962)
A_WGT = acc(Wt.astype(np.float32), 5126, 'VEC4', 34962)
A_IDX = acc(F.astype(np.uint32).reshape(-1), 5125, 'SCALAR', 34963)

g.materials.append(Material(name='Armor', pbrMetallicRoughness=PbrMetallicRoughness(
    baseColorFactor=[0.72, 0.74, 0.78, 1], metallicFactor=0.15, roughnessFactor=0.75)))
g.meshes.append(Mesh(name='Body', primitives=[Primitive(
    attributes=Attributes(POSITION=A_POS, NORMAL=A_NOR, JOINTS_0=A_JNT, WEIGHTS_0=A_WGT),
    indices=A_IDX, material=0)]))

for n in NAMES:
    par = J[n][0]
    local = JP[n] - (JP[par] if par else 0)
    g.nodes.append(Node(name=n, translation=local.astype(float).tolist(), children=[]))
for n in NAMES:
    if J[n][0]: g.nodes[IDX[J[n][0]]].children.append(IDX[n])
mesh_node = len(g.nodes)
g.nodes.append(Node(name='Body', mesh=0, skin=0))

ibm = np.zeros((len(NAMES), 16), np.float32)
for n in NAMES:
    m = np.eye(4, dtype=np.float32); m[:3, 3] = -JP[n]
    ibm[IDX[n]] = m.T.reshape(-1)           # coluna-maior
A_IBM = acc(ibm.reshape(-1, 16), 5126, 'MAT4')
g.skins.append(Skin(name='Skeleton', joints=list(range(len(NAMES))), skeleton=IDX['Hips'], inverseBindMatrices=A_IBM))

for name, T, fn, loop in CLIPS:
    times, R, Tr = sample(fn, T, loop)
    a_t = acc(times, 5126, 'SCALAR', None, True)
    anim = Animation(name=name, samplers=[], channels=[])
    for n in NAMES:
        for path, data, typ in (('rotation', R[n], 'VEC4'), ('translation', Tr[n], 'VEC3')):
            if path == 'translation' and n != 'Hips': continue
            if path == 'rotation' and np.allclose(data, data[0]) and np.allclose(data[0], IDQ): continue
            a_o = acc(data.astype(np.float32), 5126, typ)
            anim.samplers.append(AnimationSampler(input=a_t, output=a_o, interpolation='LINEAR'))
            anim.channels.append(AnimationChannel(sampler=len(anim.samplers) - 1,
                                                  target=AnimationChannelTarget(node=IDX[n], path=path)))
    g.animations.append(anim)

g.scenes.append(Scene(nodes=[IDX['Hips'], mesh_node])); g.scene = 0
pad()
g.buffers.append(Buffer(byteLength=len(blob)))
g.set_binary_blob(bytes(blob))
g.save_binary(OUT)
print('salvo', OUT, f'{len(blob)/1024:.0f} KB', [a.name for a in g.animations])
