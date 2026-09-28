import bpy, bmesh, mathutils
bpy.ops.wm.open_mainfile(filepath="/root/.claude/uploads/04ec379f-5c91-5c49-b0da-f659d202349f/57131a62-GOLFI_1.blend")
drop = {"asientos", "volante_torpedo"}
ratio = {"llantas": 0.22, "cromo": 0.35, "plasticos_ext": 0.5, "ruedas": 0.45, "parte_de_abajo": 0.5, "chapa": 0.8}
rename = {"luces_frontales": "FARO", "luz_roja": "STOP", "luces_rojas_2": "STOP", "luces_amarillas": "GIRO", "luces_amarillas_2": "GIRO", "espejos": "PLASTICO", "ruedas": "GOMA", "llantas": "LLANTA", "cromo": "CROMO"}
order = []
def slot(name):
    if name not in order: order.append(name)
    return order.index(name)
out = bmesh.new()
dg = bpy.context.evaluated_depsgraph_get()
for o in list(bpy.data.objects):
    if o.type != 'MESH' or o.name in drop: continue
    if o.name in ratio:
        d = o.modifiers.new("dec", 'DECIMATE'); d.ratio = ratio[o.name]
dg = bpy.context.evaluated_depsgraph_get(); dg.update()
for o in list(bpy.data.objects):
    if o.type != 'MESH' or o.name in drop: continue
    ev = o.evaluated_get(dg)
    me = ev.to_mesh()
    bm = bmesh.new(); bm.from_mesh(me); bm.transform(o.matrix_world)
    names = []
    for s in o.material_slots:
        n = s.material.name if s.material else "PLASTICO"
        names.append({"plastico": "PLASTICO", "LLANTAS": "LLANTA", "Material": "PLASTICO", "LUZ ROJA": "STOP", "LUZ AMARILLA": "GIRO"}.get(n, n))
    for f in bm.faces:
        f.material_index = slot(rename[o.name]) if o.name in rename else slot(names[f.material_index] if names else "PLASTICO")
    tmp = bpy.data.meshes.new("tmp"); bm.to_mesh(tmp); bm.free()
    out.from_mesh(tmp)
    ev.to_mesh_clear()
bmesh.ops.triangulate(out, faces=out.faces[:])
xs = [v.co.x for v in out.verts]; ys = [v.co.y for v in out.verts]; zs = [v.co.z for v in out.verts]
s = 4.15 / (max(xs) - min(xs)); c = mathutils.Vector(((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, min(zs)))
for v in out.verts: v.co = (v.co - c) * s
me = bpy.data.meshes.new("Arlequin"); out.to_mesh(me); out.free()
for n in order: me.materials.append(bpy.data.materials.new(n))
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
car = bpy.data.objects.new("Arlequin", me); bpy.context.scene.collection.objects.link(car)
xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
print("medidas m:", round(max(xs)-min(xs),2), round(max(ys)-min(ys),2), round(max(zs)-min(zs),2), "tris", len(me.polygons), "materiales", order)
bpy.ops.export_scene.gltf(filepath="/tmp/claude-0/-home-user-Tarifario-Bong/04ec379f-5c91-5c49-b0da-f659d202349f/scratchpad/golf.glb", export_format='GLB', export_texcoords=False, export_normals=True, export_yup=True)
