"""Personagem Freedivers a partir do 'cyberpunk character 3d model(1).glb' (T-pose, UV, 65 ossos com dedos).

Mantém a malha e as UVs originais (já é uma malha leve de ~18k triângulos), cria o esqueleto,
os pesos de skin, embute a textura e escreve as animações.

uso: python build_cyber.py <modelo.glb> <textura.(png|webp|jpg)> <saida.glb> [--preview]
"""
import sys, io, json, math, struct
import numpy as np
import trimesh
from PIL import Image
from pygltflib import (GLTF2, Scene, Node, Mesh, Primitive, Attributes, Skin, Buffer, BufferView, Accessor,
                       Animation, AnimationSampler, AnimationChannel, AnimationChannelTarget, Material,
                       PbrMetallicRoughness, TextureInfo, Texture, Sampler, Image as GImage, Asset)

SRC, TEX, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
HEIGHT = 1.8
FPS = 30

# ───────────── 1. Leitura da malha, esqueleto e pesos (GLB riggado no padrão Mixamo, 65 ossos) ─────────────
raw = open(SRC, 'rb').read()
jl = struct.unpack('<I', raw[12:16])[0]
J0 = json.loads(raw[20:20 + jl])
binoff = 20 + jl + 8
def read_acc(i):
    a = J0['accessors'][i]; bv = J0['bufferViews'][a['bufferView']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
    dt = {5126: np.float32, 5123: np.uint16, 5125: np.uint32}[a['componentType']]
    off = binoff + bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    arr = np.frombuffer(raw, dtype=dt, count=a['count'] * n, offset=off)
    return arr.reshape(a['count'], n) if n > 1 else arr
prim = J0['meshes'][0]['primitives'][0]
at = prim['attributes']
V = read_acc(at['POSITION']).astype(np.float64)
N = read_acc(at['NORMAL']).astype(np.float32)
UV = read_acc(at['TEXCOORD_0']).astype(np.float32)
F = read_acc(prim['indices']).astype(np.int64).reshape(-1, 3)
top = read_acc(at['JOINTS_0']).astype(np.int64)
Wt = read_acc(at['WEIGHTS_0']).astype(np.float32)
Wt /= Wt.sum(1, keepdims=True)
print(f'malha: {len(F)} tris / {len(V)} verts, altura {V[:,1].max()-V[:,1].min():.3f}')
V[:, 1] -= V[:, 1].min()
scale_src = 1.0 / V[:, 1].max()
Vn = V * scale_src

# ───────────── 2. Esqueleto ─────────────
# O arquivo não traz as transformações dos nós, só as matrizes de bind inversas, que estão num sistema
# Z-para-cima (x frente, y esquerda, z cima). Reconstruímos as posições e levamos para o espaço da malha
# (x esquerda, y cima, z frente); a posição vertical foi calibrada com o centroide dos vértices por osso.
skin = J0['skins'][0]
ibm_f = read_acc(skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
P_ibm = np.array([np.linalg.inv(m)[:3, 3] for m in ibm_f])
P_mesh = np.c_[P_ibm[:, 1], P_ibm[:, 2] + 0.497, P_ibm[:, 0] + 0.01]
def rename(n):
    n = n.replace('mixamorig:', '')
    side = 'L' if n.startswith('Left') else 'R' if n.startswith('Right') else ''
    b = n[4:] if side == 'L' else n[5:] if side == 'R' else n
    table = {'Hips': 'Hips', 'Spine': 'Spine', 'Spine1': 'Chest', 'Spine2': 'Chest2', 'Neck': 'Neck', 'Head': 'Head',
             'HeadTop_End': 'HeadTip', 'Shoulder': 'Clavicle', 'Arm': 'UpperArm', 'ForeArm': 'LowerArm', 'Hand': 'Hand',
             'UpLeg': 'UpperLeg', 'Leg': 'LowerLeg', 'Foot': 'Foot', 'ToeBase': 'Toe', 'Toe_End': 'ToeEnd'}
    if b.startswith('Hand') and len(b) > 4: b = b[4:]
    b = table.get(b, b)
    return f'{b}_{side}' if side else b
jnodes = skin['joints']
NAMES = [rename(J0['nodes'][i]['name']) for i in jnodes]
IDX = {n: i for i, n in enumerate(NAMES)}
parent_node = {c: p for p, nd in enumerate(J0['nodes']) for c in nd.get('children', [])}
JJ = {}
for k, ni in enumerate(jnodes):
    pn = parent_node.get(ni)
    JJ[NAMES[k]] = (NAMES[jnodes.index(pn)] if pn in jnodes else None, P_mesh[k])

# ───────────── 3. Peças soltas (usadas só para pintar o rosto) ─────────────
x, y = Vn[:, 0], Vn[:, 1]
vkey = {}
pos_id = np.array([vkey.setdefault(tuple(np.round(p, 5)), len(vkey)) for p in Vn])
tm = trimesh.Trimesh(np.array(list(vkey.keys())), pos_id[F], process=False)
comps = trimesh.graph.connected_components(tm.edges_unique, nodes=np.arange(len(vkey)), min_len=1)

S = HEIGHT / V[:, 1].max()
Vf = V * S
JP = {n: JJ[n][1] * scale_src * S for n in NAMES}

# ───────────── 4. Animações ─────────────
def qx(d): h = math.radians(d) / 2; return np.array([math.sin(h), 0, 0, math.cos(h)])
def qy(d): h = math.radians(d) / 2; return np.array([0, math.sin(h), 0, math.cos(h)])
def qz(d): h = math.radians(d) / 2; return np.array([0, 0, math.sin(h), math.cos(h)])
def qmul(a, b):
    x1, y1, z1, w1 = a; x2, y2, z2, w2 = b
    return np.array([w1*x2 + x1*w2 + y1*z2 - z1*y2, w1*y2 - x1*z2 + y1*w2 + z1*x2,
                     w1*z2 + x1*y2 - y1*x2 + z1*w2, w1*w2 - x1*x2 - y1*y2 - z1*z2])
def rot(x=0, y=0, z=0): return qmul(qx(x), qmul(qy(y), qz(z)))       # Z, depois Y, depois X
def rot_bone(name, e):
    # antebraço: (torção, flexão do cotovelo, 0) — torção em torno do próprio osso, aplicada primeiro
    if name.startswith('LowerArm'): return qmul(qy(e[1]), qx(e[0]))
    return rot(*e)
def qmat(q):
    x, y, z, w = q
    return np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                     [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                     [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
IDQ = np.array([0, 0, 0, 1.0])
sm = lambda t: t * t * (3 - 2 * t)
def seg(t, a, b): return sm(min(1, max(0, (t - a) / (b - a))))
EXTRA = ('Rifle', 'Mag', 'SpareMag')          # nós extras (props), não fazem parte do skin
HIDDEN = 0.0001

# Convenções (T-pose, ossos sem rotação no repouso):
#   perna/braço pendurado: X negativo = para frente | joelho: X positivo dobra para trás
#   tronco (osso para cima): X positivo = inclina para frente
def set_arm(p, side, up, lo):
    m = 1 if side == 'L' else -1       # lado R é o espelho do L (Y e Z invertidos)
    p[f'UpperArm_{side}'] = (up[0], m * up[1], m * up[2])
    p[f'LowerArm_{side}'] = (lo[0], m * lo[1], m * lo[2])

# ── Cinemática inversa do braço (esquerdo; o direito é o espelho) ──
from scipy.optimize import minimize
_S, _E, _W = JP['UpperArm_L'], JP['LowerArm_L'], JP['Hand_L']
_PALM = (_W + JP['Middle1_L']) / 2                           # centro da palma (entre o pulso e a base dos dedos)
def arm_fk(par):
    Ru = qmat(rot(*par[:3])); Rl = qmat(qmul(qy(par[4]), qx(par[3])))
    elbow = _S + Ru @ (_E - _S)
    return elbow, elbow + Ru @ Rl @ (_PALM - _E), Ru @ Rl @ np.array([0, -1.0, 0])
def solve_arm(target_chest, normal=None, init=(0, -70, -14, 0, -40)):
    tgt = JP['Chest2'] + np.array(target_chest)
    def cost(par):
        el, palm, nm = arm_fk(par)
        c = 1e4 * np.sum((palm - tgt) ** 2) + 1e-5 * np.sum(np.square(par[:3]))
        c += 30 * max(0, el[1] - (_S[1] - 0.10)) ** 2           # cotovelo para baixo
        ec = el - JP['Chest2']                                   # cotovelo fora do tronco (meia largura ~0.22, profundidade ~0.14)
        if ec[2] < 0.14: c += 300 * max(0, 0.22 - ec[0]) ** 2
        if normal is not None: c += 0.4 * np.sum((nm - normal) ** 2)
        return c
    r = minimize(cost, init, method='L-BFGS-B', bounds=[(-130, 130), (-160, 40), (-130, 60), (-110, 110), (-150, 5)])
    err = np.linalg.norm(arm_fk(r.x)[1] - tgt)
    p = r.x
    return (tuple(p[:3]), (p[3], p[4], 0.0)), err
IN = np.array([-1.0, 0, 0])      # palma voltada para o eixo da arma (visto do lado L)
# Posições no espaço do osso do peito (m). Arma compacta centrada no peito.
RIFLE_AT = np.array([0.0, -0.01, 0.38])
GRIP_R = RIFLE_AT + [0.035, -0.095, -0.10]      # empunhadura (mão direita, espelhada para o espaço L)
FORE_L = RIFLE_AT + [0.035, -0.045, 0.10]       # guarda-mão (mão esquerda)
READY_L, err_l = solve_arm(FORE_L, IN)
READY_R, err_r = solve_arm(GRIP_R, IN, init=(0, -80, -10, 0, -60))
BELT, e1 = solve_arm([0.20, -0.28, 0.20], None, init=(-26, -8, -74, 0, -60))
MAGW, e2 = solve_arm(RIFLE_AT + [0.04, -0.20, 0.02], None, init=(-6, -52, -30, 0, -70))
CHRG, e3 = solve_arm(RIFLE_AT + [0.05, 0.03, -0.02], None, init=(6, -82, -4, 0, -50))
for _n, _p in (('L', READY_L), ('R', READY_R), ('cinto', BELT), ('poço', MAGW), ('ferrolho', CHRG)):
    print('  cotovelo', _n, np.round(arm_fk(list(_p[0]) + [_p[1][0], _p[1][1]])[0] - JP['Chest2'], 3))
print('IK erro (m): empunhadura R %.3f, guarda-mão L %.3f, cinto %.3f, poço %.3f, ferrolho %.3f' % (err_r, err_l, e1, e2, e3))
print('READY_L', np.round(READY_L[0], 1), np.round(READY_L[1], 1), '| READY_R', np.round(READY_R[0], 1), np.round(READY_R[1], 1))
def curl(p, side, grip):
    """Dedos: ângulos de flexão (graus) por falange; Z negativo no lado L fecha a mão, o R é o espelho."""
    m = 1 if side == 'L' else -1
    for fing, angs in grip['fingers'].items():
        for k, a in enumerate(angs, 1): p[f'{fing}{k}_{side}'] = (0, 0, -a * m)
    for k, (ty, tz) in enumerate(grip['thumb'], 1): p[f'Thumb{k}_{side}'] = (0, m * ty, m * tz)
GRIP_PISTOL = dict(fingers={'Index': (22, 28, 18), 'Middle': (72, 80, 55), 'Ring': (76, 86, 56), 'Pinky': (80, 86, 58)},
                   thumb=[(-25, -25), (-12, -25), (0, -22)])
GRIP_FORE = dict(fingers={'Index': (62, 72, 46), 'Middle': (66, 76, 50), 'Ring': (70, 82, 52), 'Pinky': (76, 86, 54)},
                 thumb=[(-25, -25), (-12, -25), (0, -22)])
def ready(breathe=0.0):
    p = {}
    curl(p, 'L', GRIP_FORE); curl(p, 'R', GRIP_PISTOL)
    set_arm(p, 'L', (READY_L[0][0], READY_L[0][1] + breathe, READY_L[0][2]), READY_L[1])
    set_arm(p, 'R', (READY_R[0][0], READY_R[0][1] + breathe, READY_R[0][2]), READY_R[1])
    return p

def lerp_pose(a, b, t):
    out = {}
    for k in set(a) | set(b):
        va, vb = a.get(k, (0, 0, 0)), b.get(k, (0, 0, 0))
        out[k] = tuple(va[i] + (vb[i] - va[i]) * t for i in range(3))
    return out
def keyed(u, keys):
    if u <= keys[0][0]: return dict(keys[0][1])
    for (u0, p0), (u1, p1) in zip(keys, keys[1:]):
        if u <= u1: return lerp_pose(p0, p1, sm((u - u0) / (u1 - u0)))
    return dict(keys[-1][1])
def with_(base, **over):
    p = dict(base); p.update({k.replace('__', '_') if False else k: v for k, v in over.items()}); return p

def split(p):
    rots = {k: v for k, v in p.items() if not k.startswith(('T_', 'S_'))}
    tr = {k[2:]: v for k, v in p.items() if k.startswith('T_')}
    sc = {k[2:]: v[0] for k, v in p.items() if k.startswith('S_')}
    return rots, tr, sc

# ── Idle: respiração, cabeça e arma balançando de leve ──
def clip_idle(t, T):
    ph = 2 * math.pi * t / T
    p = ready(breathe=1.2 * math.sin(ph))
    p['Chest'] = (1.5 * math.sin(ph), 0.8 * math.sin(ph * .5), 0)
    p['Head'] = (1.0 * math.sin(ph + .5), 3 * math.sin(ph * .5), 0)
    p['T_Hips'] = (0, 0.006 * math.sin(ph), 0)
    return p

# ── Locomoção (andar/correr): ciclo completo = 2 passos ──
def locomotion(t, T, hip_f, hip_b, knee, foot_k, lean, bob, twist, sway, arm_bob):
    ph = 2 * math.pi * t / T
    p = ready(breathe=arm_bob * math.cos(2 * ph))
    s = math.sin(ph)
    for side, sg in (('L', 1), ('R', -1)):
        a = sg * s                                    # >0: perna avançando
        hip = -hip_f * a if a > 0 else -hip_b * a     # passo à frente maior que o de trás
        knee_flex = knee * max(0.0, math.cos(ph) * sg) + 0.12 * knee * max(0.0, -math.cos(ph) * sg) + 0.08 * knee
        p[f'UpperLeg_{side}'] = (hip, 0, 0)
        p[f'LowerLeg_{side}'] = (knee_flex, 0, 0)
        p[f'Foot_{side}'] = (-foot_k * (hip + knee_flex), 0, 0)
    p['Hips'] = (0.6 * lean, twist * s, sway * s)
    p['Spine'] = (0.5 * lean, -0.6 * twist * s, -sway * 0.5 * s)
    p['Chest'] = (0.4 * lean + 1.2 * math.cos(2 * ph), -0.4 * twist * s, 0)
    p['Head'] = (-0.5 * lean, 0.8 * twist * s, 0)
    p['T_Hips'] = (0, bob * math.cos(2 * ph), 0)
    return p
def clip_walk(t, T): return locomotion(t, T, 30, 24, 40, 0.6, 5, 0.014, 5, 2.5, 1.0)
def clip_run(t, T): return locomotion(t, T, 55, 34, 85, 0.6, 20, 0.035, 9, 4.0, 2.5)

# ── Dash: agachada rápida, arrancada inclinada, deslize e recuperação ──
def clip_dash(t, T):
    u = t / T
    base = ready()
    K = [
        (0.00, with_(base)),
        (0.16, with_(base, Hips=(8, 0, 0), T_Hips=(0, -0.10, 0), Spine=(14, 0, 0), Chest=(8, 0, 0),
                     UpperLeg_L=(-48, 0, 0), LowerLeg_L=(80, 0, 0), UpperLeg_R=(-30, 0, 0), LowerLeg_R=(60, 0, 0),
                     Foot_L=(-4, 0, 0), Foot_R=(-4, 0, 0), Head=(-8, 0, 0))),
        (0.42, with_(base, Hips=(30, 0, 0), T_Hips=(0, -0.05, 0), Spine=(8, 0, 0), Chest=(4, 0, 0), Head=(-26, 0, 0),
                     UpperLeg_L=(-82, 0, 0), LowerLeg_L=(30, 0, 0), UpperLeg_R=(-8, 0, 0), LowerLeg_R=(14, 0, 0),
                     Foot_L=(40, 0, 0), Foot_R=(30, 0, 0))),
        (0.72, with_(base, Hips=(16, 0, 0), T_Hips=(0, -0.14, 0), Spine=(10, 0, 0), Head=(-14, 0, 0),
                     UpperLeg_L=(-62, 0, 0), LowerLeg_L=(78, 0, 0), UpperLeg_R=(-4, 0, 0), LowerLeg_R=(36, 0, 0),
                     Foot_L=(-8, 0, 0), Foot_R=(8, 0, 0))),
        (1.00, with_(base)),
    ]
    return keyed(u, K)

# ── Roll (mantida, não usada pelo jogo) ──
def clip_roll(t, T):
    u = t / T
    tuck = math.sin(math.pi * min(1, u * 1.1))
    p = ready()
    p['Hips'] = (360 * sm(u), 0, 0)
    p['Spine'] = (40 * tuck, 0, 0); p['Chest'] = (25 * tuck, 0, 0); p['Head'] = (20 * tuck, 0, 0)
    p['UpperLeg_L'] = (-90 * tuck, 0, 0); p['UpperLeg_R'] = (-90 * tuck, 0, 0)
    p['LowerLeg_L'] = (110 * tuck, 0, 0); p['LowerLeg_R'] = (110 * tuck, 0, 0)
    p['T_Hips'] = (0, -0.28 * math.sin(math.pi * u), 0)
    return p

# ── Reload: solta o carregador, pega outro no cinto, encaixa, bate e puxa o ferrolho ──
def clip_reload(t, T):
    u = t / T
    base = ready()
    def L(up, lo, **o): return with_(base, UpperArm_L=tuple(up), LowerArm_L=tuple(lo), **o)
    look = dict(Chest=(5, 6, 0), Head=(9, 6, 0))
    def A(pose, **o): return L(pose[0], pose[1], **o)
    G, Bt, Mw, Ch = READY_L, BELT, MAGW, CHRG
    tap = (Mw[0][0] - 5, Mw[0][1], Mw[0][2]), Mw[1]
    K = [
        (0.00, A(G)),
        (0.10, A(G, Chest=(2, 3, 0), Head=(4, 3, 0))),                          # aperta o botão
        (0.24, A(Bt, **look, T_Hips=(0, -0.01, 0))),                            # mão ao cinto
        (0.38, A(Bt, **look, T_Hips=(0, -0.01, 0))),                            # pega o novo carregador
        (0.54, A(Mw, **look)),                                                  # leva ao poço
        (0.62, A(Mw, **look)),                                                  # encaixa
        (0.68, A(tap, **look)),                                                 # tapa
        (0.80, A(Ch, Chest=(3, 4, 0), Head=(5, 4, 0))),                         # puxa o ferrolho
        (0.90, A(Ch, Chest=(2, 2, 0))),
        (1.00, A(G)),
    ]
    p = keyed(u, K)
    # props: carregador da arma some ao soltar (0.14-0.52); o reserva aparece na mão (0.32-0.56)
    p['S_Mag'] = (HIDDEN if 0.14 <= u < 0.56 else 1.0, 0, 0)
    p['S_SpareMag'] = (1.0 if 0.30 <= u < 0.56 else HIDDEN, 0, 0)
    return p

def clip_shoot(t, T):
    u = t / T
    k = math.exp(-10 * u)
    p = ready()
    for n_ in ('UpperArm_L', 'UpperArm_R'): p[n_] = (p[n_][0] - 9 * k, p[n_][1], p[n_][2])
    p['Chest'] = (-4 * k, 0, 0); p['Spine'] = (-3 * k, 0, 0); p['Head'] = (-2 * k, 0, 0)
    return p

CLIPS = [('Idle', 3.0, clip_idle, True), ('Walk', 1.0, clip_walk, True), ('Run', 0.64, clip_run, True),
         ('Dash', 0.5, clip_dash, False), ('Roll', 0.5, clip_roll, False),
         ('Reload', 1.7, clip_reload, False), ('Shoot', 0.25, clip_shoot, False)]

def sample(fn, T, loop):
    n = max(2, int(round(T * FPS)) + (0 if loop else 1))
    times, rots, trans = [], {k: [] for k in NAMES}, {k: [] for k in NAMES}
    scales = {k: [] for k in EXTRA}
    for i in range(n):
        t = i / FPS if loop else min(T, i / FPS)
        pose, tr, sc = split(fn(t, T)); times.append(t)
        for k in NAMES:
            rots[k].append(rot_bone(k, pose.get(k, (0, 0, 0))))
            d = tr.get(k)
            trans[k].append(JP[k] - (JP[JJ[k][0]] if JJ[k][0] else 0) + (np.array(d) if d else 0))
        for k in EXTRA:
            scales[k].append(sc.get(k, HIDDEN if k == 'SpareMag' else 1.0))
    for k in NAMES:
        for i in range(1, n):
            if np.dot(rots[k][i], rots[k][i - 1]) < 0: rots[k][i] = -rots[k][i]
    return (np.array(times, np.float32), {k: np.array(v, np.float32) for k, v in rots.items()},
            {k: np.array(v, np.float32) for k, v in trans.items()},
            {k: np.array(v, np.float32) for k, v in scales.items()})

# ───────────── 5. Escrita do glTF ─────────────
g = GLTF2(asset=Asset(version='2.0', generator='Freedivers build_cyber.py'))
blob = bytearray()
def pad():
    while len(blob) % 4: blob.append(0)
def view(data, target=None):
    pad()
    g.bufferViews.append(BufferView(buffer=0, byteOffset=len(blob), byteLength=len(data), target=target))
    blob.extend(data); return len(g.bufferViews) - 1
def acc(arr, ctype, typ, target=None, minmax=False):
    bvi = view(arr.tobytes(), target)
    a = Accessor(bufferView=bvi, componentType=ctype, count=arr.shape[0], type=typ)
    if minmax: a.min = arr.reshape(arr.shape[0], -1).min(0).tolist(); a.max = arr.reshape(arr.shape[0], -1).max(0).tolist()
    g.accessors.append(a); return len(g.accessors) - 1

A_POS = acc(Vf.astype(np.float32), 5126, 'VEC3', 34962, True)
A_NOR = acc(N, 5126, 'VEC3', 34962)
A_UV = acc(UV, 5126, 'VEC2', 34962)
A_JNT = acc(top.astype(np.uint8), 5121, 'VEC4', 34962)
A_WGT = acc(Wt.astype(np.float32), 5126, 'VEC4', 34962)
A_IDX = acc(F.astype(np.uint32).reshape(-1), 5125, 'SCALAR', 34963)

img = Image.open(TEX).convert('RGB')
if '--fix-face' in sys.argv:
    # O atlas fornecido pinta a ilha da cabeça com um padrão de grade; pinta o rosto com o tom de pele
    # amostrado das fotos do próprio atlas (canto superior esquerdo).
    from PIL import ImageDraw
    W_, H_ = img.size
    crop = np.asarray(img.crop((0, int(H_ * .055), int(W_ * .17), int(H_ * .18)))).reshape(-1, 3).astype(float)
    bright = crop[crop.sum(1) > 330]
    skin = tuple(int(v) for v in np.median(bright, 0))
    head_pos = [c for c in comps if len(c) > 500 and tm.vertices[c][:, 1].mean() > 0.85 and tm.vertices[c][:, 1].min() < 0.80]
    head_set = np.zeros(len(vkey), bool)
    for c in head_pos: head_set[c] = True
    dr = ImageDraw.Draw(img)
    painted = 0
    for f in F:
        cen = Vn[f].mean(0)
        if head_set[pos_id[f[0]]] and cen[1] > 0.84 and cen[2] > -0.01 and abs(cen[0]) < 0.056:
            dr.polygon([(UV[i][0] * W_, UV[i][1] * H_) for i in f], fill=skin); painted += 1
    print('rosto pintado:', painted, 'triângulos, tom', skin)
buf = io.BytesIO(); img.save(buf, 'JPEG', quality=93)
g.images.append(GImage(bufferView=view(buf.getvalue()), mimeType='image/jpeg'))
g.samplers.append(Sampler(magFilter=9729, minFilter=9987, wrapS=10497, wrapT=10497))
g.textures.append(Texture(source=0, sampler=0))
g.materials.append(Material(name='Cyber', doubleSided=True, pbrMetallicRoughness=PbrMetallicRoughness(
    baseColorTexture=TextureInfo(index=0), baseColorFactor=[1, 1, 1, 1], metallicFactor=0.0, roughnessFactor=0.85)))
g.meshes.append(Mesh(name='Body', primitives=[Primitive(
    attributes=Attributes(POSITION=A_POS, NORMAL=A_NOR, TEXCOORD_0=A_UV, JOINTS_0=A_JNT, WEIGHTS_0=A_WGT),
    indices=A_IDX, material=0)]))

for n in NAMES:
    par = JJ[n][0]
    g.nodes.append(Node(name=n, translation=(JP[n] - (JP[par] if par else 0)).astype(float).tolist(), children=[]))
for n in NAMES:
    if JJ[n][0]: g.nodes[IDX[JJ[n][0]]].children.append(IDX[n])
mesh_node = len(g.nodes)
g.nodes.append(Node(name='Body', mesh=0, skin=0))

# Arma e carregadores como props presos ao osso do peito / mão esquerda (para a animação de recarga)
def boxes(parts):
    P, Nn, I = [], [], []
    for (sx, sy, sz), (cx, cy, cz) in parts:
        base = len(P)
        for ax, sg in ((0, 1), (0, -1), (1, 1), (1, -1), (2, 1), (2, -1)):
            nrm = np.zeros(3); nrm[ax] = sg
            u_, v_ = [i for i in range(3) if i != ax]
            for a_, b_ in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                q = np.zeros(3); q[ax] = sg * 0.5; q[u_] = a_ * 0.5; q[v_] = b_ * 0.5
                P.append(q * [sx, sy, sz] + [cx, cy, cz]); Nn.append(nrm)
            k = len(P) - 4
            I += [k, k + 1, k + 2, k, k + 2, k + 3] if sg > 0 else [k, k + 2, k + 1, k, k + 3, k + 2]
    return np.array(P, np.float32), np.array(Nn, np.float32), np.array(I, np.uint32)
g.materials.append(Material(name='Metal', pbrMetallicRoughness=PbrMetallicRoughness(
    baseColorFactor=[0.16, 0.18, 0.21, 1], metallicFactor=0.5, roughnessFactor=0.5)))
def add_prop(name, parts):
    P, Nn, I = boxes(parts)
    pa = acc(P, 5126, 'VEC3', 34962, True); na = acc(Nn, 5126, 'VEC3', 34962); ia = acc(I, 5125, 'SCALAR', 34963)
    g.meshes.append(Mesh(name=name, primitives=[Primitive(attributes=Attributes(POSITION=pa, NORMAL=na), indices=ia, material=1)]))
    return len(g.meshes) - 1
rifle_mesh = add_prop('Rifle', [((.05, .10, .10), (0, -.01, -.22)), ((.06, .10, .24), (0, 0, -.05)), ((.05, .065, .16), (0, -.005, .15)),
                                ((.02, .02, .08), (0, .005, .27)), ((.035, .10, .045), (0, -.095, -.10)), ((.025, .03, .08), (0, .065, -.02))])
mag_mesh = add_prop('Mag', [((.045, .15, .06), (0, 0, 0))])
rifle_n = len(g.nodes); g.nodes.append(Node(name='Rifle', mesh=rifle_mesh, translation=RIFLE_AT.tolist()))
mag_n = len(g.nodes); g.nodes.append(Node(name='Mag', mesh=mag_mesh, translation=(RIFLE_AT + [0, -0.10, 0.02]).tolist()))
spare_n = len(g.nodes); g.nodes.append(Node(name='SpareMag', mesh=mag_mesh, translation=(_PALM - _W + [0, -0.03, 0]).tolist(), scale=[HIDDEN] * 3))
g.nodes[IDX['Chest2']].children += [rifle_n, mag_n]
g.nodes[IDX['Hand_L']].children += [spare_n]
EXTRA_IDX = {'Rifle': rifle_n, 'Mag': mag_n, 'SpareMag': spare_n}
ibm = np.zeros((len(NAMES), 16), np.float32)
for n in NAMES:
    m = np.eye(4, dtype=np.float32); m[:3, 3] = -JP[n]; ibm[IDX[n]] = m.T.reshape(-1)
g.skins.append(Skin(name='Skeleton', joints=list(range(len(NAMES))), skeleton=IDX['Hips'],
                    inverseBindMatrices=acc(ibm, 5126, 'MAT4')))

for name, T, fn, loop in CLIPS:
    times, R, Tr, Sc = sample(fn, T, loop)
    a_t = acc(times, 5126, 'SCALAR', None, True)
    anim = Animation(name=name, samplers=[], channels=[])
    for k in ('Mag', 'SpareMag'):
        dflt = HIDDEN if k == 'SpareMag' else 1.0
        if not np.allclose(Sc[k], dflt):
            data = np.repeat(Sc[k][:, None], 3, 1).astype(np.float32)
            anim.samplers.append(AnimationSampler(input=a_t, output=acc(data, 5126, 'VEC3'), interpolation='LINEAR'))
            anim.channels.append(AnimationChannel(sampler=len(anim.samplers) - 1,
                                                  target=AnimationChannelTarget(node=EXTRA_IDX[k], path='scale')))
    for n in NAMES:
        for path, data, typ in (('rotation', R[n], 'VEC4'), ('translation', Tr[n], 'VEC3')):
            if path == 'translation' and n != 'Hips': continue
            if path == 'rotation' and np.allclose(data, IDQ): continue
            anim.samplers.append(AnimationSampler(input=a_t, output=acc(data.astype(np.float32), 5126, typ), interpolation='LINEAR'))
            anim.channels.append(AnimationChannel(sampler=len(anim.samplers) - 1,
                                                  target=AnimationChannelTarget(node=IDX[n], path=path)))
    g.animations.append(anim)

g.scenes.append(Scene(nodes=[IDX['Hips'], mesh_node])); g.scene = 0
pad(); g.buffers.append(Buffer(byteLength=len(blob))); g.set_binary_blob(bytes(blob)); g.save_binary(OUT)
print('salvo', OUT, f'{len(blob)/1024:.0f} KB', [a.name for a in g.animations])
