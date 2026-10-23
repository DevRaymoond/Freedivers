import bpy, math, os
import numpy as np
from mathutils import Vector, Quaternion

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'tools', 'source', 'spider', 'tripo_convert_e548c8d3-cd07-46b5-93a0-2033f56ddf57.fbx')
OUT_BLEND = os.path.join(ROOT, 'assets', 'spider.blend')
OUT_GLB = os.path.join(ROOT, 'assets', 'spider.glb')
OUT_PREVIEW = os.path.join(ROOT, 'assets', 'spider_preview.png')
FPS = 24

# Clean the startup scene and import the supplied, unrigged FBX.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SRC, automatic_bone_orientation=True)
for obj in list(bpy.context.scene.objects):
    if obj.type != 'MESH':
        bpy.data.objects.remove(obj, do_unlink=True)
mesh = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
mesh.name = 'SpiderMesh'
mesh.data.name = 'SpiderGeometry'
bpy.context.view_layer.objects.active = mesh
mesh.select_set(True)
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
mesh.location = (0, 0, 0)

# O FBX vem com ~89 mil vértices (denso demais para dezenas de inimigos na tela, sobretudo em celular): reduz para ~10% preservando a silhueta.
TARGET_RATIO = 0.10
dec = mesh.modifiers.new('Decimate', 'DECIMATE'); dec.decimate_type = 'COLLAPSE'; dec.ratio = TARGET_RATIO
bpy.ops.object.modifier_apply(modifier=dec.name)
print('Vértices após a redução:', len(mesh.data.vertices))

# Rebuild the imported material with explicit glTF-friendly PBR connections.
source_mat = mesh.data.materials[0]
images = {}
if source_mat and source_mat.use_nodes:
    for node in source_mat.node_tree.nodes:
        if node.type == 'TEX_IMAGE' and node.image:
            images[os.path.basename(bpy.path.abspath(node.image.filepath)).lower()] = node.image
color_img = images.get('color.jpg')
normal_img = images.get('normal.png')
rough_img = next((v for k, v in images.items() if 'roughness' in k), None)
metal_img = next((v for k, v in images.items() if 'metallic' in k), None)
if not color_img:
    raise RuntimeError('A textura Color.jpg não foi localizada no FBX.')

mat = source_mat
mat.name = 'Spider | Original PBR'

# Keep the supplied PBR appearance and add a translucent layer over the rear abdomen.
shell = bpy.data.materials.new('Spider | Translucent abdomen')
shell.diffuse_color = (0.42, 0.8, 0.05, 0.88); shell.use_nodes = True
sbs = shell.node_tree.nodes.get('Principled BSDF')
s_tex = shell.node_tree.nodes.new('ShaderNodeTexImage'); s_tex.image = color_img
shell.node_tree.links.new(s_tex.outputs['Color'], sbs.inputs['Base Color'])
sbs.inputs['Roughness'].default_value = 0.20
sbs.inputs['Metallic'].default_value = 0.08
sbs.inputs['Transmission Weight'].default_value = 0.08
sbs.inputs['Alpha'].default_value = 0.88
sbs.inputs['Coat Weight'].default_value = 0.45
sbs.inputs['Coat Roughness'].default_value = 0.16
sbs.inputs['IOR'].default_value = 1.42
shell.surface_render_method = 'BLENDED'
mesh.data.materials.clear()
for m in (mat, shell): mesh.data.materials.append(m)

# Face regions are isolated by position because the FBX is one welded mesh.
verts = np.asarray([v.co[:] for v in mesh.data.vertices], dtype=np.float64)
face_centers = np.asarray([np.mean([mesh.data.vertices[i].co[:] for i in p.vertices], axis=0) for p in mesh.data.polygons])
# Leg material follows the eight leg chains outside the central body volume.
leg_regions = np.sqrt(face_centers[:,0]**2 + face_centers[:,1]**2) > 0.255
leg_regions &= face_centers[:,2] < 0.57
leg_regions &= ~((face_centers[:,1] < -0.26) & (face_centers[:,2] > 0.20) & (np.abs(face_centers[:,0]) < 0.25))
# The rear bulb is glossy and partially transparent like the reference.
shell_regions = (face_centers[:,1] > 0.10) & (face_centers[:,2] > 0.43) & ~leg_regions
# Preserve the supplied eye colors and highlights from the original texture.
for poly, is_leg, is_shell in zip(mesh.data.polygons, leg_regions, shell_regions):
    poly.material_index = 1 if is_shell else 0
    poly.use_smooth = False
print('Material region face counts:', {'body': int(np.sum(~(leg_regions|shell_regions))), 'shell': int(np.sum(shell_regions)), 'legs': int(np.sum(leg_regions))})

# Eight two-segment legs and articulated head/abdomen.
legs = []
for name, y, hx, kx, ky, tx, ty, phase_i in [
    ('F', -0.17, 0.17, 0.37, -0.32, 0.47, -0.46, 0),
    ('MF', -0.075, 0.20, 0.46, -0.12, 0.47, -0.015, 1),
    ('MR', 0.075, 0.20, 0.46, 0.15, 0.46, 0.28, 2),
    ('R', 0.17, 0.15, 0.37, 0.36, 0.31, 0.47, 3),
]:
    for side, s in (('L', 1), ('R', -1)):
        root = (s*hx, y, 0.34 if name in ('F','MF') else 0.36)
        knee = (s*kx, ky, 0.18)
        toe = (s*tx, ty, 0.025)
        legs.append({'name':f'Leg_{name}_{side}', 'side':side, 'phase_i':phase_i, 'root':root, 'knee':knee, 'toe':toe})

arm_data = bpy.data.armatures.new('SpiderRig')
arm = bpy.data.objects.new('SpiderRig', arm_data)
bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
def add_bone(name, head, tail, parent=None):
    b = arm_data.edit_bones.new(name); b.head=head; b.tail=tail
    if parent: b.parent=arm_data.edit_bones[parent]
    return b
add_bone('Root', (0,0,0), (0,0,0.16))
add_bone('Thorax', (0,0,0.27), (0,0,0.44), 'Root')
add_bone('Head', (0,-0.10,0.37), (0,-0.28,0.35), 'Thorax')
add_bone('Abdomen', (0,0.03,0.41), (0,0.28,0.53), 'Thorax')
for L in legs:
    a=L['name']; add_bone(a+'_Upper', L['root'], L['knee'], 'Thorax')
    add_bone(a+'_Lower', L['knee'], L['toe'], a+'_Upper')
bpy.ops.object.mode_set(mode='OBJECT')

# Deterministic distance weights keep each leg attached to its own two-bone chain.
def segment_distance(points, a, b):
    a=np.asarray(a); d=np.asarray(b)-a; den=float(np.dot(d,d))
    t=np.clip(((points-a)@d)/den,0,1)
    return np.linalg.norm(points-(a+t[:,None]*d),axis=1)
N=len(verts); upper_d=np.empty((N,len(legs))); lower_d=np.empty_like(upper_d)
for i,L in enumerate(legs):
    upper_d[:,i]=segment_distance(verts,L['root'],L['knee'])
    lower_d[:,i]=segment_distance(verts,L['knee'],L['toe'])
rad=np.sqrt(verts[:,0]**2+verts[:,1]**2)
leg_mask=(rad>0.255)&(verts[:,2]<0.57)
leg_idx=np.where(leg_mask)[0]
closest=np.argmin(np.minimum(upper_d[leg_idx],lower_d[leg_idx]),axis=1)
body_idx=np.where(~leg_mask)[0]
groups={}
for L in legs:
    for part in ('Upper','Lower'): groups[L['name']+'_'+part]=mesh.vertex_groups.new(name=L['name']+'_'+part)
g_head=mesh.vertex_groups.new(name='Head'); g_abd=mesh.vertex_groups.new(name='Abdomen'); g_thor=mesh.vertex_groups.new(name='Thorax')
# Local blend around the body joints; all per-vertex influences are normalized.
for vi in body_idx:
    x,y,z=verts[vi]
    wh=np.clip((-y-0.10)/0.13,0,1) if z>0.20 else 0
    wa=np.clip((y-0.02)/0.16,0,1)*np.clip((z-0.30)/0.14,0,1)
    if wh+wa>1: wh,wa=wh/(wh+wa),wa/(wh+wa)
    wt=max(0,1-wh-wa)
    if wh>1e-4:g_head.add([int(vi)],float(wh),'REPLACE')
    if wa>1e-4:g_abd.add([int(vi)],float(wa),'REPLACE')
    if wt>1e-4:g_thor.add([int(vi)],float(wt),'REPLACE')
for vi,li in zip(leg_idx,closest):
    du=upper_d[vi,li]; dl=lower_d[vi,li]
    wu=float(np.clip(0.5+(dl-du)/0.18,0,1))
    if wu>1e-4: groups[legs[li]['name']+'_Upper'].add([int(vi)],wu,'REPLACE')
    if wu<0.9999: groups[legs[li]['name']+'_Lower'].add([int(vi)],1-wu,'REPLACE')
mod=mesh.modifiers.new('Spider skin', 'ARMATURE'); mod.object=arm; mod.use_vertex_groups=True
mesh.parent=arm

# Keyframed clips: low idle, alternating eight-leg gait, and a readable spit attack.
arm.animation_data_create()

def qaxis(axis, angle): return Quaternion(Vector(axis).normalized(), angle)
def local_for_world(pbone, qworld):
    rest=pbone.bone.matrix_local.to_3x3().to_quaternion()
    return rest.conjugated() @ qworld @ rest

def set_pose_world(bone_name, axis, degrees):
    pb=arm.pose.bones[bone_name]; pb.rotation_mode='QUATERNION'
    pb.rotation_quaternion=local_for_world(pb,qaxis(axis,math.radians(degrees)))

def reset_pose():
    for pb in arm.pose.bones:
        pb.rotation_mode='QUATERNION'; pb.rotation_quaternion=(1,0,0,0); pb.location=(0,0,0); pb.scale=(1,1,1)

def key_all(frame):
    for pb in arm.pose.bones:
        pb.keyframe_insert(data_path='rotation_quaternion',frame=frame,group=pb.name)
        pb.keyframe_insert(data_path='location',frame=frame,group=pb.name)

def create_action(name, duration, pose_fn, loop=False):
    action=bpy.data.actions.new(name); action.use_fake_user=True
    arm.animation_data.action=action
    frame_count=round(duration*FPS)
    frames=range(1,frame_count+2) if loop else list(range(1,frame_count+2))
    for frame in frames:
        u=(frame-1)/frame_count
        reset_pose(); pose_fn(u)
        key_all(frame)
    return action

def idle_pose(u):
    w=2*math.pi*u
    for L in legs:
        side=1 if L['side']=='L' else -1
        phase=math.radians(L['phase_i']*48 + side*22)
        set_pose_world(L['name']+'_Upper',(0,0,1),side*(2.0*math.sin(w+phase)))
        set_pose_world(L['name']+'_Lower',(-L['knee'][1]+L['root'][1], L['knee'][0]-L['root'][0],0),2.0*math.sin(w+phase+0.4))
    set_pose_world('Abdomen',(1,0,0),2.5*math.sin(w))
    set_pose_world('Head',(1,0,0),1.2*math.sin(w+0.6))

def walk_pose(u):
    w=2*math.pi*u
    for L in legs:
        side=1 if L['side']=='L' else -1
        phase=((L['phase_i']+(0 if L['side']=='L' else 1))%2)*math.pi
        swing=math.sin(w+phase)
        lift=max(0,math.cos(w+phase))
        set_pose_world(L['name']+'_Upper',(0,0,1),-side*18*swing)
        dx=L['knee'][0]-L['root'][0]; dy=L['knee'][1]-L['root'][1]
        tangent=(-dy,dx,0)
        set_pose_world(L['name']+'_Lower',tangent,-22*lift)
    set_pose_world('Thorax',(1,0,0),1.8*math.cos(2*w))
    set_pose_world('Abdomen',(1,0,0),2.5*math.sin(2*w))

def spit_pose(u):
    # Keyed moments: crouch, pull abdomen back, thrust the head, then recover.
    if u < 0.22:
        f=u/0.22; head=10*f; thorax=3*f; abdomen=-4*f; leg=5*f
    elif u < 0.48:
        f=(u-0.22)/0.26; head=10-20*f; thorax=3-5*f; abdomen=-4+10*f; leg=5-3*f
    elif u < 0.68:
        f=(u-0.48)/0.20; head=-10+5*f; thorax=-2+1*f; abdomen=6-4*f; leg=2-2*f
    else:
        f=(u-0.68)/0.32; head=-5*(1-f); thorax=-1*(1-f); abdomen=2*(1-f); leg=0
    set_pose_world('Head',(1,0,0),head)
    set_pose_world('Thorax',(1,0,0),thorax)
    set_pose_world('Abdomen',(1,0,0),abdomen)
    for L in legs:
        if L['name'].startswith('Leg_F_'):
            side=1 if L['side']=='L' else -1
            set_pose_world(L['name']+'_Upper',(0,0,1),-side*leg)
            dx=L['knee'][0]-L['root'][0]; dy=L['knee'][1]-L['root'][1]
            set_pose_world(L['name']+'_Lower',(-dy,dx,0),-leg*0.8)

idle=create_action('Idle',2.0,idle_pose,True)
walk=create_action('Walk',0.8,walk_pose,True)
spit=create_action('Spit',0.9,spit_pose,False)
scene=bpy.context.scene; scene.render.fps=FPS; scene.frame_start=1; scene.frame_end=round(2.0*FPS)+1
arm.animation_data.action=idle

# Keep the Blender project self-contained and export the same rig plus named clips to glTF.
for image in bpy.data.images:
    try: image.pack()
    except: pass
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); mesh.select_set(True); bpy.context.view_layer.objects.active=arm
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
glb_path = os.path.normpath(os.path.abspath(OUT_GLB))
print('Export path:', repr(glb_path))
bpy.ops.export_scene.gltf(filepath=glb_path, export_format='GLB', use_selection=True,
    export_animations=True, export_animation_mode='ACTIONS', export_skins=True,
    export_materials='EXPORT', export_yup=True, export_apply=True,
    export_optimize_animation_size=False, export_force_sampling=True)
print('Saved',OUT_BLEND,OUT_GLB)

# Small render preview of the resting pose for review.
arm.animation_data.action=idle; scene.frame_set(1)
scene.render.engine='BLENDER_EEVEE'; scene.render.resolution_x=900; scene.render.resolution_y=700; scene.render.resolution_percentage=100
scene.view_settings.view_transform='Standard'; scene.view_settings.look='Medium High Contrast'; scene.view_settings.exposure=0; scene.view_settings.gamma=1
scene.render.image_settings.file_format='PNG'; scene.render.film_transparent=True; scene.render.filepath=OUT_PREVIEW
camd=bpy.data.cameras.new('PreviewCamera'); cam=bpy.data.objects.new('PreviewCamera',camd); scene.collection.objects.link(cam)
target=Vector((0,0,0.38)); cam.location=(1.65,-2.8,1.65); cam.rotation_euler=(target-Vector(cam.location)).to_track_quat('-Z','Y').to_euler(); camd.type='ORTHO'; camd.ortho_scale=1.55; scene.camera=cam
for name,loc,power,size in [('Key',(2,-2,2.7),120,3),('Fill',(-2,-.6,1.2),70,2),('Rim',(0,2,2.2),150,2)]:
    d=bpy.data.lights.new(name,'AREA'); d.energy=power; d.shape='DISK'; d.size=size
    ob=bpy.data.objects.new(name,d); scene.collection.objects.link(ob); ob.location=loc
    ob.rotation_euler=(Vector((0,0,.35))-Vector(loc)).to_track_quat('-Z','Y').to_euler()
bpy.ops.render.render(write_still=True)
