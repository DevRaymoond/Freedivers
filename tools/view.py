import sys, trimesh, numpy as np
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
path, out = sys.argv[1], sys.argv[2]
m = trimesh.load(path, force='mesh')
v = m.vertices
fig, ax = plt.subplots(1, 3, figsize=(15, 8))
for a, (i, j, t) in zip(ax, [(0,1,'frente (x,y)'),(2,1,'lado (z,y)'),(0,2,'topo (x,z)')]):
    a.scatter(v[::6, i], v[::6, j], s=0.3, c='k'); a.set_aspect('equal'); a.set_title(t)
plt.savefig(out, dpi=70); print(v.min(0), v.max(0), len(m.faces))
