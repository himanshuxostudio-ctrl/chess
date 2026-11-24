"""
Phase 4–5 — humanoid skeleton + rigging for Ancient Warfare Chess.

Skeleton: one shared, retarget-friendly humanoid layout (Mixamo-style bone names) fitted per
character from measured landmarks. Fused weapons/shields are made rigid to the hand/forearm.

Landmarks are (x, z) in metres from gridded orthographic renders (front view, character faces −Y,
character LEFT = +X). Depth (y) of torso joints is read from the side view; limb depths are
derived from the mesh surface by `_limb_y`.
"""
import bpy, os, math, mathutils
from mathutils import Vector

# Bone hierarchy: name -> (parent, head landmark, tail landmark)
BONES = [
    ("Root", None, "root", "root_tail"),
    ("Hips", "Root", "hips", "spine"),
    ("Spine", "Hips", "spine", "chest"),
    ("Spine1", "Spine", "chest", "upper_chest"),
    ("Spine2", "Spine1", "upper_chest", "neck"),
    ("Neck", "Spine2", "neck", "head"),
    ("Head", "Neck", "head", "head_top"),
    ("LeftShoulder", "Spine2", "clav_L", "shoulder_L"),
    ("LeftArm", "LeftShoulder", "shoulder_L", "elbow_L"),
    ("LeftForeArm", "LeftArm", "elbow_L", "wrist_L"),
    ("LeftHand", "LeftForeArm", "wrist_L", "hand_L"),
    ("RightShoulder", "Spine2", "clav_R", "shoulder_R"),
    ("RightArm", "RightShoulder", "shoulder_R", "elbow_R"),
    ("RightForeArm", "RightArm", "elbow_R", "wrist_R"),
    ("RightHand", "RightForeArm", "wrist_R", "hand_R"),
    ("LeftUpLeg", "Hips", "hip_L", "knee_L"),
    ("LeftLeg", "LeftUpLeg", "knee_L", "ankle_L"),
    ("LeftFoot", "LeftLeg", "ankle_L", "ball_L"),
    ("LeftToeBase", "LeftFoot", "ball_L", "toe_L"),
    ("RightUpLeg", "Hips", "hip_R", "knee_R"),
    ("RightLeg", "RightUpLeg", "knee_R", "ankle_R"),
    ("RightFoot", "RightLeg", "ankle_R", "ball_R"),
    ("RightToeBase", "RightFoot", "ball_R", "toe_R"),
    ("Cape1", "Spine2", "cape0", "cape1"),
    ("Cape2", "Cape1", "cape1", "cape2"),
    ("Cape3", "Cape2", "cape2", "cape3"),
    # side chains so the cape's full width (where it wraps past the arms) has its own bones
    ("CapeL1", "Spine2", "capeL0", "capeL1"),
    ("CapeL2", "CapeL1", "capeL1", "capeL2"),
    ("CapeL3", "CapeL2", "capeL2", "capeL3"),
    ("CapeR1", "Spine2", "capeR0", "capeR1"),
    ("CapeR2", "CapeR1", "capeR1", "capeR2"),
    ("CapeR3", "CapeR2", "capeR2", "capeR3"),
]
DEFORM_EXCLUDE = {"Root"}

# Per-character landmarks. torso entries are (x, y, z); limb entries are (x, z) with y derived.
LANDMARKS = {
    "PAWN": {
        "origin": (-0.0055, -0.1208),  # measured with the old feet-centred pivot
        "torso": {
            "hips": (0, 0.12, 0.96), "spine": (0, 0.13, 1.10), "chest": (0, 0.14, 1.26), "upper_chest": (0, 0.14, 1.38),
            "neck": (0, 0.12, 1.50), "head": (0, 0.10, 1.57), "head_top": (0, 0.10, 1.80),
            "clav_L": (0.05, 0.13, 1.46), "clav_R": (-0.05, 0.13, 1.46),
            "cape0": (0, 0.27, 1.40), "cape1": (0, 0.31, 1.08), "cape2": (0, 0.32, 0.76), "cape3": (0, 0.33, 0.44),
        },
        # side cape chains: x offset from centre, and depth pulled forward as the cape wraps
        "cape_side": {"dx": 0.24, "dy": -0.06},
        "limbs": {
            "shoulder_L": (0.21, 1.42), "elbow_L": (0.26, 0.13, 1.18), "wrist_L": (0.28, 0.03, 1.02), "hand_L": (0.29, 0.0, 0.94),
            "shoulder_R": (-0.21, 1.42), "elbow_R": (-0.25, 1.17), "wrist_R": (-0.34, 1.18), "hand_R": (-0.41, 1.18),
            "hip_L": (0.09, 0.93), "knee_L": (0.15, 0.50), "ankle_L": (0.18, 0.12), "ball_L": (0.18, 0.04), "toe_L": (0.18, 0.02),
            "hip_R": (-0.09, 0.93), "knee_R": (-0.16, 0.50), "ankle_R": (-0.18, 0.12), "ball_R": (-0.18, 0.04), "toe_R": (-0.18, 0.02),
        },
        # Fused props made rigid: (bone, predicate on vertex coordinate)
        "rigid": [
            # spear + grip: the shaft leans (x≈-0.33 at the butt, ≈-0.40 at the tip), so follow its axis
            ("RightHand", "x < -0.285 - 0.039 * (z - 0.05)"),
            ("LeftForeArm", "x > 0.255 and 0.62 < z < 1.30"),                       # round shield
        ],
    },
    "KING": {
        "origin": (0.0159, 0.0085),
        "torso": {
            "hips": (0, -0.09, 1.00), "spine": (0, -0.09, 1.14), "chest": (0, -0.08, 1.30), "upper_chest": (0, -0.08, 1.43),
            "neck": (0, -0.08, 1.56), "head": (0, -0.09, 1.64), "head_top": (0, -0.09, 1.87),
            "clav_L": (0.05, -0.08, 1.50), "clav_R": (-0.05, -0.08, 1.50),
            "cape0": (0, 0.06, 1.48), "cape1": (0, 0.13, 1.08), "cape2": (0, 0.20, 0.62), "cape3": (0, 0.28, 0.18),
        },
        "cape_side": {"dx": 0.30, "dy": -0.05},
        "limbs": {
            "shoulder_L": (0.24, 1.45), "elbow_L": (0.33, 1.24), "wrist_L": (0.37, 1.00), "hand_L": (0.38, 0.86),
            "shoulder_R": (-0.24, 1.45), "elbow_R": (-0.33, 1.24), "wrist_R": (-0.38, 1.00), "hand_R": (-0.39, 0.86),
            "hip_L": (0.10, 0.97), "knee_L": (0.14, 0.52), "ankle_L": (0.17, 0.11), "ball_L": (0.17, 0.04), "toe_L": (0.17, 0.02),
            "hip_R": (-0.10, 0.97), "knee_R": (-0.14, 0.52), "ankle_R": (-0.22, 0.11), "ball_R": (-0.22, 0.04), "toe_R": (-0.22, 0.02),
        },
        "rigid": [
            # sword in its scabbard, hanging diagonally from the belt on the left hip
            ("Hips", "0.38 < z < 1.20 and abs(x - (0.12 + (1.18 - z) * 0.35)) < 0.045 and abs(y - (-0.30 + (1.19 - z) * 0.457)) < (0.05 if z > 0.55 else 0.03)"),
        ],
    },
    "QUEEN": {
        "origin": (-0.0274, -0.0067),
        "torso": {
            "hips": (0, -0.04, 0.98), "spine": (0, -0.04, 1.13), "chest": (0, -0.04, 1.30), "upper_chest": (0, -0.04, 1.42),
            "neck": (0, -0.03, 1.57), "head": (0, -0.04, 1.64), "head_top": (0, -0.04, 1.85),
            "clav_L": (0.05, -0.03, 1.52), "clav_R": (-0.05, -0.03, 1.52),
            "cape0": (0, 0.08, 1.48), "cape1": (0, 0.14, 1.05), "cape2": (0, 0.22, 0.62), "cape3": (0, 0.30, 0.20),
        },
        "cape_side": {"dx": 0.30, "dy": -0.05},
        "limbs": {
            "shoulder_L": (0.20, 1.50), "elbow_L": (0.24, -0.02, 1.25), "wrist_L": (0.27, -0.08, 1.10), "hand_L": (0.28, -0.10, 1.04),
            "shoulder_R": (-0.21, 1.50), "elbow_R": (-0.29, 1.23), "wrist_R": (-0.35, 1.03), "hand_R": (-0.37, 0.92),
            "hip_L": (0.09, 0.95), "knee_L": (0.12, 0.52), "ankle_L": (0.14, 0.11), "ball_L": (0.14, 0.04), "toe_L": (0.14, 0.02),
            "hip_R": (-0.09, 0.95), "knee_R": (-0.12, 0.52), "ankle_R": (-0.17, 0.11), "ball_R": (-0.17, 0.04), "toe_R": (-0.17, 0.02),
        },
        "rigid": [
            ("LeftForeArm", "x > 0.215 and (y + 0.10) ** 2 + (z - 1.09) ** 2 < 0.21 ** 2"),         # round shield (disc seen from the side)
            ("RightHand", "x < -0.33 and 0.30 < z < 1.02 and y < -0.24 - (0.73 - z) * 1.5 + 0.06"),  # sword: follows the blade diagonal (side view)
        ],
    },
    "BISHOP": {
        "origin": (-0.1169, 0.0285),
        "torso": {
            "hips": (0.17, 0.08, 1.00), "spine": (0.17, 0.08, 1.15), "chest": (0.18, 0.08, 1.30), "upper_chest": (0.18, 0.08, 1.40),
            "neck": (0.19, 0.07, 1.52), "head": (0.20, 0.07, 1.60), "head_top": (0.20, 0.07, 1.86),
            "clav_L": (0.22, 0.08, 1.47), "clav_R": (0.12, 0.08, 1.47),
            "cape0": (0.17, 0.18, 1.45), "cape1": (0.17, 0.24, 1.05), "cape2": (0.17, 0.30, 0.62), "cape3": (0.17, 0.36, 0.20),
        },
        "cape_side": {"dx": 0.30, "dy": -0.05},
        "limbs": {
            "shoulder_L": (0.36, 1.47), "elbow_L": (0.40, 1.20), "wrist_L": (0.36, -0.02, 1.27), "hand_L": (0.31, -0.06, 1.30),
            "shoulder_R": (-0.02, 1.47), "elbow_R": (-0.07, 1.20), "wrist_R": (-0.16, 1.28), "hand_R": (-0.22, 1.30),
            "hip_L": (0.25, 0.95), "knee_L": (0.27, 0.52), "ankle_L": (0.27, 0.11), "ball_L": (0.27, 0.04), "toe_L": (0.27, 0.02),
            "hip_R": (0.09, 0.95), "knee_R": (0.07, 0.52), "ankle_R": (0.05, 0.11), "ball_R": (0.05, 0.04), "toe_R": (0.05, 0.02),
        },
        # The Bishop strikes with the staff (right arm); the book arm stays still in his attack.
        "pose_overrides": {"attack": {"LeftArm": (0, 0, 0), "LeftForeArm": (0, 0, 0)}},
        "rigid": [
            ("RightHand", "x < -0.13 - 0.035 * z"),                       # sun staff (leans slightly) + sleeve
            ("LeftHand", "x > 0.31 and 1.24 < z < 1.48 and y < -0.04"),    # book held to the chest
        ],
    },
}


def _pred(cond, lm):
    """Compile a rigid-region predicate written in the landmark frame (see "origin")."""
    ox, oy = lm.get("origin", (0.0, 0.0))
    f = eval(f"lambda x, y, z: {cond}")
    return lambda x, y, z: f(x - ox, y - oy, z)


def _limb_y(me_verts, x, z, wx=0.045, wz=0.035):
    """Depth of a limb joint: front surface of the limb + half its thickness (capes lie behind)."""
    pts = [v for v in me_verts if abs(v.x - x) < wx and abs(v.z - z) < wz]
    if len(pts) < 4:
        pts = [v for v in me_verts if abs(v.x - x) < wx * 2 and abs(v.z - z) < wz * 2]
    if not pts:
        return 0.1
    ys = sorted(v.y for v in pts)
    xs = [v.x for v in pts]
    r = max(0.03, min(0.08, (max(xs) - min(xs)) / 2))
    return ys[max(0, int(len(ys) * 0.03))] + r


def build_rig(scene, mesh_obj, key):
    lm = LANDMARKS[key]
    verts = [mesh_obj.matrix_world @ v.co for v in mesh_obj.data.vertices]
    ox, oy = lm.get("origin", (0.0, 0.0))
    shift = lambda v: Vector((v[0] + ox, v[1] + oy, v[2]))
    P = {k: shift(v) for k, v in lm["torso"].items()}
    for k, v in lm["limbs"].items():
        # (x, y, z) = explicit depth (e.g. an arm hidden behind a shield); (x, z) = derive from surface
        if len(v) == 3:
            P[k] = shift(v)
        else:
            x = v[0] + ox
            P[k] = Vector((x, _limb_y(verts, x, v[1]), v[1]))
    for s in ("L", "R"):
        # Hip joints sit in the pelvis, not at the front of flared trousers / robes.
        if len(lm["limbs"][f"hip_{s}"]) == 2:
            P[f"hip_{s}"].y = P["hips"].y
        # Knees: between hip and ankle with a slight forward bias (robes hide the real knee surface).
        if len(lm["limbs"][f"knee_{s}"]) == 2:
            P[f"knee_{s}"].y = (P[f"hip_{s}"].y + P[f"ankle_{s}"].y) / 2 - 0.03
        # Shoulders sit at clavicle depth.
        if len(lm["limbs"][f"shoulder_{s}"]) == 2:
            P[f"shoulder_{s}"].y = P[f"clav_{s}"].y
    # feet: toes point forward (−Y) from the ankle
    for s in ("L", "R"):
        a = P[f"ankle_{s}"]
        P[f"ball_{s}"] = Vector((P[f"ball_{s}"].x, a.y - 0.10, P[f"ball_{s}"].z))
        P[f"toe_{s}"] = Vector((P[f"toe_{s}"].x, a.y - 0.17, P[f"toe_{s}"].z))
    P["root"] = Vector((0, 0, 0)); P["root_tail"] = Vector((0, 0, 0.25))
    cs = lm.get("cape_side", {"dx": 0.2, "dy": -0.05})
    for i in range(4):
        c = P[f"cape{i}"]
        k = 0.55 if i == 0 else 1.0  # side chains start closer to the shoulders
        P[f"capeL{i}"] = Vector((c.x + cs["dx"] * k, c.y + cs["dy"] * (i > 0), c.z))
        P[f"capeR{i}"] = Vector((c.x - cs["dx"] * k, c.y + cs["dy"] * (i > 0), c.z))

    name = f"{mesh_obj.name}_Rig"
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    arm = bpy.data.armatures.new(name)
    rig = bpy.data.objects.new(name, arm)
    scene.collection.objects.link(rig)
    rig.show_in_front = True
    bpy.context.window.scene = scene
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.edit_bones
    for bname, parent, h, t in BONES:
        b = eb.new(bname)
        b.head, b.tail = P[h], P[t]
        b.roll = 0
        if parent:
            b.parent = eb[parent]
            b.use_connect = (eb[parent].tail - b.head).length < 1e-4
        b.use_deform = bname not in DEFORM_EXCLUDE
    # Consistent rolls: arms/legs roll so their local X is the bend axis
    for b in eb:
        if b.name.startswith(("Left", "Right")) or b.name.startswith(("Hips", "Spine", "Neck", "Head", "Cape")):
            b.align_roll(Vector((0, -1, 0)))
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig, P


def bind(scene, mesh_obj, rig, key):
    """Heat-weight bind, then make fused props rigid and clean weights (≤4 influences)."""
    mesh_obj.vertex_groups.clear()
    for m in list(mesh_obj.modifiers):
        if m.type == 'ARMATURE':
            mesh_obj.modifiers.remove(m)
    mesh_obj.parent = None
    for o in scene.objects:
        o.select_set(False)
    mesh_obj.hide_viewport = False
    mesh_obj.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    with bpy.context.temp_override(selected_editable_objects=[mesh_obj, rig], active_object=rig, object=rig):
        bpy.ops.object.parent_set(type='ARMATURE_AUTO')

    me = mesh_obj.data
    vg = {g.name: g for g in mesh_obj.vertex_groups}
    for bname in [b[0] for b in BONES if b[0] not in DEFORM_EXCLUDE]:
        if bname not in vg:
            vg[bname] = mesh_obj.vertex_groups.new(name=bname)

    rigid_count = {}
    for bone, cond in LANDMARKS[key]["rigid"]:
        f = _pred(cond, LANDMARKS[key])
        idx = [v.index for v in me.vertices if f(*v.co)]
        for g in mesh_obj.vertex_groups:
            g.remove(idx)
        vg[bone].add(idx, 1.0, 'REPLACE')
        rigid_count[bone] = len(idx)

    LEG = ("LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase", "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase")
    ARM_END = ("LeftForeArm", "LeftHand", "RightForeArm", "RightHand")
    ARM = ("LeftArm", "RightArm") + ARM_END
    CAPE = ("Cape1", "Cape2", "Cape3", "CapeL1", "CapeL2", "CapeL3", "CapeR1", "CapeR2", "CapeR3")
    # Families that may touch on these fused meshes but must never share influence.
    INCOMPATIBLE = [(set(ARM), set(LEG)), (set(CAPE), set(ARM))]

    def ctx_ops(fn):
        with bpy.context.temp_override(object=mesh_obj, active_object=mesh_obj, selected_editable_objects=[mesh_obj]):
            bpy.context.view_layer.objects.active = mesh_obj
            fn()

    # 1. Smooth body weights; rigid props are masked out so they stay perfectly rigid.
    rigid_idx = set()
    for bone, cond in LANDMARKS[key]["rigid"]:
        f = _pred(cond, LANDMARKS[key])
        rigid_idx.update(v.index for v in me.vertices if f(*v.co))
    for v in me.vertices:
        v.select = v.index not in rigid_idx
    me.use_paint_mask_vertex = True
    def _smooth():
        bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
        bpy.ops.object.vertex_group_smooth(group_select_mode='ALL', factor=0.5, repeat=4, expand=0.0)
        bpy.ops.object.mode_set(mode='OBJECT')
    ctx_ops(_smooth)
    me.use_paint_mask_vertex = False

    # 2. Region separation for fused geometry (hand fused to thigh, elbow fused to cape, ...).
    #    a) label each face by the family of its dominant bones,
    #    b) split the seams between incompatible face regions so the surfaces can part,
    #    c) on every vertex keep only weights compatible with the faces it now belongs to,
    #    d) refill vertices left empty from same-region neighbours (then nearest allowed bone).
    import bmesh
    from collections import Counter
    from mathutils.geometry import intersect_point_line as _ipl
    FAMILY = {}
    for n in ARM: FAMILY[n] = "ARM_LOW" if n in ARM_END else "ARM_UP"
    for n in LEG: FAMILY[n] = "LEG"
    for n in CAPE: FAMILY[n] = "CAPE"
    for n in ("Hips", "Spine"): FAMILY[n] = "TORSO_LOW"
    BAD = {frozenset(p) for p in (
        ("ARM_UP", "LEG"), ("ARM_LOW", "LEG"), ("ARM_UP", "CAPE"), ("ARM_LOW", "CAPE"), ("LEG", "CAPE"),
        ("ARM_LOW", "TORSO_LOW"),                 # hands/forearms resting on hips & belt
        ("ARM_UP", "TORSO_LOW"),                  # elbows/sleeves hanging against the hips
        ("CAPE", "TORSO_LOW"))}                   # capes hang from the shoulders, free of the waist

    def _base(f):
        return f[2:] if f.startswith("P:") else f

    def is_bad(f1, f2):
        """Face-family incompatibility. 'P:<fam>' = a fused prop rigid to a bone of family <fam>:
        it inherits that family's rules and also parts from legs, capes and (if hand-held) the torso."""
        if frozenset((_base(f1), _base(f2))) in BAD:
            return True
        for p, o in ((f1, f2), (f2, f1)):
            if p.startswith("P:") and not o.startswith("P:"):
                ob = _base(o)
                if ob in ("LEG", "CAPE"):
                    return True
                if _base(p) == "ARM_LOW" and ob in ("BODY", "TORSO_LOW", "ARM_UP"):
                    return True
        return False
    gname = {g.index: g.name for g in mesh_obj.vertex_groups}
    gindex = {v: k for k, v in gname.items()}
    fam_of = lambda gi: FAMILY.get(gname[gi], "BODY")

    bm = bmesh.new(); bm.from_mesh(me)
    dl = bm.verts.layers.deform.verify()
    def vfam(v):
        w = v[dl]
        return fam_of(max(w.items(), key=lambda kv: kv[1])[0]) if len(w) else "BODY"
    vf = {v: vfam(v) for v in bm.verts}
    face_fam = {}
    for f in bm.faces:
        rig_v = [v for v in f.verts if v.index in rigid_idx]
        if rig_v:
            # faces touching a rigid prop belong to the prop, so the seam runs around its edge
            face_fam[f] = "P:" + vf[rig_v[0]]
        else:
            c = Counter(vf[v] for v in f.verts)
            face_fam[f] = c.most_common(1)[0][0]
    split = [ed for ed in bm.edges if len(ed.link_faces) == 2
             and is_bad(face_fam[ed.link_faces[0]], face_fam[ed.link_faces[1]])]
    if split:
        bmesh.ops.split_edges(bm, edges=split)
    bm.faces.ensure_lookup_table()
    face_fam = {f: face_fam.get(f) for f in bm.faces}  # split keeps face identity

    ALL_FAMS = {"ARM_UP", "ARM_LOW", "LEG", "CAPE", "TORSO_LOW", "BODY"}
    def allowed(fams):
        """Bone families a vertex may NOT keep, given the face regions it now belongs to."""
        return {x for f in fams for x in ALL_FAMS if is_bad(f, x)}
    empty = []
    for v in bm.verts:
        if v.index in rigid_idx:
            continue
        fams = {face_fam[f] for f in v.link_faces if face_fam.get(f)}
        banned = allowed(fams)
        w = v[dl]
        for gi in [gi for gi in w.keys() if fam_of(gi) in banned]:
            del w[gi]
        if not len(w):
            empty.append((v, banned))
    # refill from neighbours in the same region
    for _ in range(6):
        nxt = []
        for v, banned in empty:
            acc = Counter()
            for e in v.link_edges:
                o = e.other_vert(v)
                for gi, wt in o[dl].items():
                    if fam_of(gi) not in banned:
                        acc[gi] += wt
            if acc:
                tot = sum(acc.values())
                for gi, wt in acc.items():
                    v[dl][gi] = wt / tot
            else:
                nxt.append((v, banned))
        empty = nxt
    dbones = [bn for bn in rig.data.bones if bn.use_deform]
    for v, banned in empty:
        pool = [bn for bn in dbones if FAMILY.get(bn.name, "BODY") not in banned]
        def d(bn):
            q, t = _ipl(v.co, bn.head_local, bn.tail_local); t = min(1.0, max(0.0, t))
            return (v.co - (bn.head_local + (bn.tail_local - bn.head_local) * t)).length
        v[dl][gindex[min(pool, key=d).name]] = 1.0
    bm.to_mesh(me); bm.free(); me.update()

    # 3. Limit to 4 influences and normalise (glTF / three.js skinning limit).
    def _limit():
        bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
        bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
    ctx_ops(_limit)

    unweighted = sum(1 for v in me.vertices if not any(g.weight > 1e-4 for g in v.groups))
    per_bone = {g.name: sum(1 for v in me.vertices for e in v.groups if e.group == g.index and e.weight > 0.01) for g in mesh_obj.vertex_groups}
    return {"unweighted_verts": unweighted, "rigid": rigid_count, "split_edges": len(split), "verts_per_bone": per_bone}


TEST_POSES = {
    "rest": {},
    # game-range poses (acceptance)
    "walk": {
        "LeftUpLeg": (math.radians(22), 0, 0), "LeftLeg": (math.radians(-30), 0, 0),
        "RightUpLeg": (math.radians(-18), 0, 0), "RightLeg": (math.radians(-10), 0, 0),
        "LeftArm": (math.radians(-12), 0, 0), "RightArm": (math.radians(15), 0, 0),
        "Spine1": (0, math.radians(6), 0),
    },
    "attack": {
        "RightArm": (math.radians(60), 0, 0), "RightForeArm": (math.radians(30), 0, 0),
        "LeftArm": (math.radians(25), 0, 0), "LeftForeArm": (math.radians(35), 0, 0),
        "Spine1": (math.radians(8), math.radians(-12), 0), "LeftUpLeg": (math.radians(15), 0, 0),
    },
    "twist": {
        "Spine1": (0, math.radians(25), 0), "Head": (math.radians(15), math.radians(-30), 0),
        "Cape2": (math.radians(25), 0, 0), "Cape3": (math.radians(25), 0, 0),
        "Hips": (math.radians(-8), 0, 0),
    },
    # stress test (informational, beyond anything the game plays)
    "extreme": {
        "RightArm": (math.radians(70), 0, 0), "RightForeArm": (math.radians(40), 0, 0),
        "LeftArm": (math.radians(35), 0, 0), "LeftForeArm": (math.radians(45), 0, 0),
        "LeftUpLeg": (math.radians(30), 0, 0), "LeftLeg": (math.radians(-45), 0, 0),
        "RightUpLeg": (math.radians(-20), 0, 0), "RightLeg": (math.radians(-15), 0, 0),
    },
}


def pose_test(scene, rig, mesh_obj, out_dir, label, poses=None):
    """Render each test pose from front and side; returns written files."""
    os.makedirs(out_dir, exist_ok=True)
    cam = scene.camera
    cam.data.ortho_scale = 2.1
    scene.render.resolution_x = scene.render.resolution_y = 600
    for o in scene.objects:
        if o.type == 'MESH':
            o.hide_render = o is not mesh_obj
    files = []
    for pname, pose in (poses or TEST_POSES).items():
        for pb in rig.pose.bones:
            pb.rotation_mode = 'XYZ'
            pb.rotation_euler = pose.get(pb.name, (0, 0, 0))
        bpy.context.view_layer.update()
        for tag, loc in (("front", (0, -6, 0.95)), ("side", (6, 0, 0.95))):
            cam.location = loc
            cam.rotation_euler = (Vector((0, 0, 0.95)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
            path = os.path.join(out_dir, f"{label}__{pname}_{tag}.png")
            scene.render.filepath = path
            bpy.ops.render.render(write_still=True, scene=scene.name)
            files.append(path)
    for pb in rig.pose.bones:
        pb.rotation_euler = (0, 0, 0)
    scene.render.resolution_x, scene.render.resolution_y = 480, 640
    return files


def poses_for(key):
    """Test poses with per-character overrides (matching how that character actually animates)."""
    ov = LANDMARKS[key].get("pose_overrides", {})
    return {n: {**p, **ov.get(n, {})} for n, p in TEST_POSES.items()}


def stretch_report(rig, mesh_obj, poses=None):
    """Deformation QA: per test pose, compare every edge length with its rest length.
    Returns the share of edges stretched/compressed beyond 1.6x / 0.5x and the worst ratio."""
    import numpy as np
    me = mesh_obj.data
    e = np.empty(len(me.edges) * 2, dtype=np.int64); me.edges.foreach_get("vertices", e); e = e.reshape(-1, 2)
    rest = np.empty(len(me.vertices) * 3); me.vertices.foreach_get("co", rest); rest = rest.reshape(-1, 3)
    rl = np.linalg.norm(rest[e[:, 0]] - rest[e[:, 1]], axis=1) + 1e-9
    out = {}
    for pname, pose in (poses or TEST_POSES).items():
        for pb in rig.pose.bones:
            pb.rotation_mode = 'XYZ'
            pb.rotation_euler = pose.get(pb.name, (0, 0, 0))
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        ev = mesh_obj.evaluated_get(dg).to_mesh()
        co = np.empty(len(ev.vertices) * 3); ev.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
        mesh_obj.evaluated_get(dg).to_mesh_clear()
        L = np.linalg.norm(co[e[:, 0]] - co[e[:, 1]], axis=1)
        r = L / rl
        grow = L - rl
        # Visible tearing = an edge both stretched >1.6x AND lengthened by more than 1 cm.
        visible = (r > 1.6) & (grow > 0.01)
        out[pname] = {"pct_stretched_1.6x": round(float((r > 1.6).mean() * 100), 3),
                      "visible_tear_edges": int(visible.sum()),
                      "max_elongation_mm": round(float(grow.max() * 1000), 1),
                      "max_ratio": round(float(r.max()), 2)}
    for pb in rig.pose.bones:
        pb.rotation_euler = (0, 0, 0)
    return out


def joint_overlay(scene, rig, mesh_obj, path):
    """Debug render: small spheres at every joint over the body (front + side), to verify fit."""
    import bmesh as _bm
    tmp = []
    mat = bpy.data.materials.get("AWC_JointDebug") or bpy.data.materials.new("AWC_JointDebug")
    mat.diffuse_color = (0.1, 1.0, 0.3, 1)
    for b in rig.data.bones:
        me = bpy.data.meshes.new("jd")
        bm = _bm.new(); _bm.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.018); bm.to_mesh(me); bm.free()
        me.materials.append(mat)
        o = bpy.data.objects.new("jd", me); o.location = b.head_local; o.show_in_front = True
        scene.collection.objects.link(o); tmp.append(o)
    old = scene.display.shading.color_type
    scene.display.shading.color_type = 'MATERIAL'
    mesh_obj.hide_render = False
    mesh_obj.color = (1, 1, 1, 1)
    scene.display.shading.show_xray = True
    scene.display.shading.xray_alpha = 0.35
    cam = scene.camera; cam.data.ortho_scale = 2.1
    scene.render.resolution_x = scene.render.resolution_y = 700
    for tag, loc in (("front", (0, -6, 0.95)), ("side", (6, 0, 0.95))):
        cam.location = loc
        cam.rotation_euler = (Vector((0, 0, 0.95)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = path.replace(".png", f"_{tag}.png")
        bpy.ops.render.render(write_still=True, scene=scene.name)
    scene.display.shading.show_xray = False
    scene.display.shading.color_type = old
    scene.render.resolution_x, scene.render.resolution_y = 480, 640
    for o in tmp:
        me = o.data; bpy.data.objects.remove(o, do_unlink=True); bpy.data.meshes.remove(me)


def rig_character(name, key, out_dir):
    """Full pipeline for one prepared humanoid scene PREP_<name>."""
    home = bpy.context.window.scene
    sc = bpy.data.scenes[f"PREP_{name}"]
    bpy.context.window.scene = sc
    mesh = sc.objects[name]
    rig, P = build_rig(sc, mesh, key)
    info = bind(sc, mesh, rig, key)
    poses = poses_for(key)
    qa = stretch_report(rig, mesh, poses)
    pose_test(sc, rig, mesh, out_dir, name, poses)
    joint_overlay(sc, rig, mesh, os.path.join(out_dir, f"{name}__joints.png"))
    bpy.context.window.scene = home
    n_edges = len(mesh.data.edges)
    game = {k: qa[k] for k in ("walk", "attack", "twist")}
    passed = all(v["visible_tear_edges"] / n_edges < 0.01 and v["max_elongation_mm"] < 80 for v in game.values())
    return {"name": name, "unweighted": info["unweighted_verts"], "rigid": info["rigid"], "split_edges": info["split_edges"],
            "qa": {k: (v["visible_tear_edges"], v["max_elongation_mm"]) for k, v in qa.items() if k != "rest"}, "pass": passed}


def diagnose(name, pose_name, top=4):
    """Where does a pose tear? Returns the bone pairs of torn edges and the worst edges with weights."""
    import numpy as np
    from collections import Counter
    home = bpy.context.window.scene
    sc = bpy.data.scenes[f"PREP_{name}"]; bpy.context.window.scene = sc
    rig, mesh = sc.objects[f"{name}_Rig"], sc.objects[name]
    me = mesh.data
    names = {gr.index: gr.name for gr in mesh.vertex_groups}
    wd = lambda v: {names[e.group]: round(e.weight, 2) for e in v.groups if e.weight > 0.02}
    e = np.empty(len(me.edges) * 2, dtype=np.int64); me.edges.foreach_get("vertices", e); e = e.reshape(-1, 2)
    rest = np.empty(len(me.vertices) * 3); me.vertices.foreach_get("co", rest); rest = rest.reshape(-1, 3)
    rl = np.linalg.norm(rest[e[:, 0]] - rest[e[:, 1]], axis=1)
    pose = TEST_POSES[pose_name]
    for pb in rig.pose.bones:
        pb.rotation_mode = 'XYZ'; pb.rotation_euler = pose.get(pb.name, (0, 0, 0))
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); ev = mesh.evaluated_get(dg).to_mesh()
    co = np.empty(len(ev.vertices) * 3); ev.vertices.foreach_get("co", co); co = co.reshape(-1, 3); mesh.evaluated_get(dg).to_mesh_clear()
    L = np.linalg.norm(co[e[:, 0]] - co[e[:, 1]], axis=1); grow = L - rl; r = L / (rl + 1e-9)
    vis = np.where((r > 1.6) & (grow > 0.01))[0]
    dom = [names[max(v.groups, key=lambda x: x.weight).group] if v.groups else "-" for v in me.vertices]
    pairs = Counter(tuple(sorted((dom[e[i, 0]], dom[e[i, 1]]))) for i in vis)
    worst = vis[np.argsort(grow[vis])[::-1][:top]]
    for pb in rig.pose.bones:
        pb.rotation_euler = (0, 0, 0)
    bpy.context.window.scene = home
    return {"pairs": [(f"{a}|{b}", n) for (a, b), n in pairs.most_common(8)],
            "worst": [{"mm": round(float(grow[i]) * 1000), "a": [round(float(c), 3) for c in rest[e[i, 0]]], "aw": wd(me.vertices[e[i, 0]]),
                       "b": [round(float(c), 3) for c in rest[e[i, 1]]], "bw": wd(me.vertices[e[i, 1]])} for i in worst]}


def save_rigged(name, out_dir):
    """Write a standalone production .blend: rig + skinned game mesh + hidden _SRC (never the open file)."""
    sc = bpy.data.scenes[f"PREP_{name}"]
    keep = [o for o in sc.objects if o.name in (name, f"{name}_Rig", f"{name}_SRC")]
    coll = bpy.data.collections.get(f"{name}_RIGGED") or bpy.data.collections.new(f"{name}_RIGGED")
    for o in keep:
        if o.name not in coll.objects:
            coll.objects.link(o)
    path = os.path.join(out_dir, f"{name}_rigged.blend")
    bpy.data.libraries.write(path, {coll, sc, *keep}, compress=True)
    return path
