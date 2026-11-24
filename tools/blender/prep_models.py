"""
Phase 3 — model preparation for Ancient Warfare Chess GLB armies.

Run inside Blender (e.g. via the Blender MCP):  exec(open(PATH).read()); prep(["sun_king", ...])

For each selected source GLB (read-only copies of the Dropbox originals) this:
  1. imports into its own scene (the user's open scenes are never touched),
  2. applies transforms, welds UV-seam-split vertices (UVs live on loops, so texturing is unaffected),
  3. moves the pivot to the ground under the character's feet (Z-up, feet at Z=0),
  4. keeps the untouched high-poly mesh as a hidden <NAME>_SRC object for later normal baking,
  5. decimates (collapse) to the real-time triangle budget,
  6. renames object / mesh / material / textures consistently,
  7. writes a standalone production .blend (bpy.data.libraries.write) without saving the open file,
  8. renders before/after comparison images.
"""
import bpy, bmesh, os, math, mathutils

ROOT = os.environ.get("AWC_ASSET_WORK") or "/Users/studioxo/Library/Application Support/Claude/scratch-workspaces/1973ccf5-0e5c-4f66-baf6-347f305919e5/cd41a121-376e-477e-8f80-2f07050a8ca7/scratch-2026-11-23-1cb53d/asset-work"
SRC = os.path.join(ROOT, "source")
OUT = os.path.join(ROOT, "production")
CMP = os.path.join(ROOT, "compare")

# key: (source file, army, piece, kind, triangle budget)
ASSETS = {
    "sun_king":      ("SUN_Maharaja_Actual.glb", "SUN", "King", "humanoid", 30000),
    "sun_queen":     ("SUN_Maharani_Queen_Crimson_Sun.glb", "SUN", "Queen", "humanoid", 30000),
    "sun_bishop":    ("SUN_Rajguru_Bishop_Solar_Sage.glb", "SUN", "Bishop", "humanoid", 30000),
    "sun_knight":    ("SUN_ASHVA YODHA.glb", "SUN", "Knight", "horse", 40000),
    "sun_rook":      ("SUN_Gajraj_Rook_Golden_Alternative.glb", "SUN", "Rook", "elephant", 40000),
    "sun_pawn":      ("SUN_Padati_Infantry_Alternative.glb", "SUN", "Pawn", "humanoid", 24000),
    "shadow_king":   ("SHADOW_Maharaja_King_Crimson_Lion.glb", "SHADOW", "King", "humanoid", 30000),
    "shadow_queen":  ("SHADOW_Maharani_Queen_Crimson_Lion.glb", "SHADOW", "Queen", "humanoid", 30000),
    "shadow_bishop": ("SHADOW_Rajguru_Bishop_Solar_Sage.glb", "SHADOW", "Bishop", "humanoid", 30000),
    "shadow_knight": ("SHADOW_Ashva_Yoddha_Knight.glb", "SHADOW", "Knight", "horse", 40000),
    "shadow_rook":   ("SHADOW_Gajraj_Rook_Crimson_Sun.glb", "SHADOW", "Rook", "elephant", 40000),
    "shadow_pawn":   ("SHADOW_Padati_Infantry_Sunfire_Legionnaire.glb", "SHADOW", "Pawn", "humanoid", 24000),
}


def _bounds(me):
    xs = [v.co for v in me.vertices]
    mn = mathutils.Vector((min(c.x for c in xs), min(c.y for c in xs), min(c.z for c in xs)))
    mx = mathutils.Vector((max(c.x for c in xs), max(c.y for c in xs), max(c.z for c in xs)))
    return mn, mx


def _render(scene, objs, path, ortho):
    cam = scene.camera
    cam.data.ortho_scale = ortho
    for o in scene.objects:
        if o.type == 'MESH':
            o.hide_render = o not in objs
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True, scene=scene.name)


def prep_one(key):
    fname, army, piece, kind, budget = ASSETS[key]
    name = f"{army}_{piece}"
    # Re-runnable: drop a previous prep scene for this piece (only data this script created).
    stale = bpy.data.scenes.get(f"PREP_{name}")
    if stale:
        for ob in list(stale.objects):
            bpy.data.objects.remove(ob, do_unlink=True)
        bpy.data.scenes.remove(stale)
        for c in [c for c in bpy.data.collections if c.name.startswith(name)]:
            bpy.data.collections.remove(c)
        for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.cameras):
            for b in list(coll):
                if b.users == 0: coll.remove(b)
    scene = bpy.data.scenes.new(f"PREP_{name}")
    bpy.context.window.scene = scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'TEXTURE'
    scene.render.resolution_x, scene.render.resolution_y = 480, 640
    cam = bpy.data.objects.new(f"{name}_Cam", bpy.data.cameras.new(f"{name}_Cam"))
    cam.data.type = 'ORTHO'
    scene.collection.objects.link(cam)
    scene.camera = cam

    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, fname))
    o = [x for x in bpy.data.objects if x not in before and x.type == 'MESH'][0]
    me = o.data
    tris_src = sum(len(p.vertices) - 2 for p in me.polygons)

    # 1. apply transforms (data API: no operator context needed)
    me.transform(o.matrix_world)
    o.matrix_world = mathutils.Matrix.Identity(4)

    # 2. weld seam-split vertices
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(me); bm.free()

    # 3. pivot on the ground: humanoids centred over the feet, animals over the bounding box
    mn, mx = _bounds(me)
    h = mx.z - mn.z
    if kind == "humanoid":
        feet = [v.co for v in me.vertices if v.co.z < mn.z + 0.04 * h]
        cx = (min(c.x for c in feet) + max(c.x for c in feet)) / 2
        cy = (min(c.y for c in feet) + max(c.y for c in feet)) / 2
    else:
        cx, cy = (mn.x + mx.x) / 2, (mn.y + mx.y) / 2
    me.transform(mathutils.Matrix.Translation((-cx, -cy, -mn.z)))
    me.update()

    # 4. keep the full-detail source for future normal baking
    src = o.copy(); src.data = me.copy()
    src.name = src.data.name = f"{name}_SRC"
    scene.collection.objects.link(src)
    src.hide_viewport = True

    # 5. decimate to budget
    ratio = min(1.0, budget / tris_src)
    mod = o.modifiers.new("Decimate", 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get()
    low = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    o.modifiers.remove(mod)
    old = o.data
    o.data = low
    if old.users == 0: bpy.data.meshes.remove(old)
    for p in low.polygons: p.use_smooth = True

    # 6. naming
    o.name = low.name = name
    mat = low.materials[0]
    mat.name = f"{name}_MAT"
    tex = {}
    for n in mat.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image:
            role = "Extra"
            for l in n.outputs[0].links:
                if l.to_node.type == 'BSDF_PRINCIPLED': role = "BaseColor"
                elif l.to_node.type == 'SEPRGB' or l.to_node.type == 'SEPARATE_COLOR': role = "MetalRough"
                elif l.to_node.type == 'NORMAL_MAP': role = "Normal"
            n.image.name = f"{name}_{role}"
            n.image.pack() if not n.image.packed_file else None
            tex[role] = list(n.image.size)
    src.data.materials[0] = mat  # share material (same textures/UVs)

    # 7. comparison renders (front + 3/4)
    lo_mn, lo_mx = _bounds(low)
    ortho = max(lo_mx.z - lo_mn.z, lo_mx.x - lo_mn.x, lo_mx.y - lo_mn.y) * 1.08
    ctr = (lo_mn + lo_mx) / 2
    for tag, ang in (("front", 0), ("q34", 45)):
        r = math.radians(ang)
        d = mathutils.Vector((math.sin(r), -math.cos(r), 0)) * 6
        cam.location = ctr + d
        cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        src.hide_viewport = False
        _render(scene, [src], os.path.join(CMP, f"{name}__src_{tag}.png"), ortho)
        _render(scene, [o], os.path.join(CMP, f"{name}__low_{tag}.png"), ortho)
        src.hide_viewport = True
    src.hide_render = True

    # 8. standalone production .blend
    coll = bpy.data.collections.new(name)
    coll.objects.link(o); coll.objects.link(src)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f"{name}.blend")
    bpy.data.libraries.write(path, {coll, o, src, scene}, compress=True)

    tris_low = sum(len(p.vertices) - 2 for p in low.polygons)
    return {
        "key": key, "name": name, "source": fname, "kind": kind,
        "tris_src": tris_src, "tris_low": tris_low, "verts_low": len(low.vertices),
        "height_m": round(lo_mx.z - lo_mn.z, 3), "footprint_xy": [round(lo_mx.x - lo_mn.x, 3), round(lo_mx.y - lo_mn.y, 3)],
        "min_z": round(lo_mn.z, 4), "textures": tex, "blend": path,
    }


def prep(keys):
    home = bpy.context.window.scene
    out = []
    for k in keys:
        out.append(prep_one(k))
    bpy.context.window.scene = home
    return out
