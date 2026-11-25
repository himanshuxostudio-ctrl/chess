"""
Phase 4–5 — animal skeletons + rigging (Knight = horse + rider, Rook = war elephant + howdah).

Shares the deformation QA / render helpers of rig_humanoid.py (exec'd into this namespace).
The fused rider is driven by its own bone chain parented to a Saddle bone on the horse's back:
the rider's seat and legs are bound to the Saddle, so the rider can never slide off the horse.
The howdah, mahout and banners are rigid on a Howdah bone parented to the elephant's spine.

Landmarks are explicit (x, y, z) in metres, measured from gridded front/side/underside renders of
the prepared meshes (animals face −Y; +X is the animal's left).
"""
import bpy, os, math
from mathutils import Vector

_here = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else None


def _load_humanoid_helpers(path):
    g = {"__name__": "awc_rig_h"}
    exec(open(path).read(), g)
    return g


# ---------------------------------------------------------------- skeleton definitions
def _leg(prefix, parent, a, b, c, d, e, names=("Upper", "Fore", "Cannon", "Hoof")):
    return [(f"{prefix}{names[0]}", parent, a, b), (f"{prefix}{names[1]}", f"{prefix}{names[0]}", b, c),
            (f"{prefix}{names[2]}", f"{prefix}{names[1]}", c, d), (f"{prefix}{names[3]}", f"{prefix}{names[2]}", d, e)]


def horse_bones(L):
    B = [("Root", None, (0, 0, 0), (0, 0, 0.25)),
         ("Pelvis", "Root", L["rump"], L["back"]),
         ("Spine1", "Pelvis", L["back"], L["chest"]),
         ("Spine2", "Spine1", L["chest"], L["withers"]),
         ("Neck1", "Spine2", L["withers"], L["neck"]),
         ("Neck2", "Neck1", L["neck"], L["poll"]),
         ("Head", "Neck2", L["poll"], L["muzzle"]),
         ("Tail1", "Pelvis", L["tail0"], L["tail1"]),
         ("Tail2", "Tail1", L["tail1"], L["tail2"]),
         ("Tail3", "Tail2", L["tail2"], L["tail3"]),
         ("Saddle", "Spine1", L["saddle0"], L["saddle1"]),
         # rider (upper body animated; seat and legs ride on the Saddle bone)
         ("RiderSpine", "Saddle", L["r_hips"], L["r_chest"]),
         ("RiderChest", "RiderSpine", L["r_chest"], L["r_neck"]),
         ("RiderNeck", "RiderChest", L["r_neck"], L["r_head"]),
         ("RiderHead", "RiderNeck", L["r_head"], L["r_head_top"]),
         ("RiderArm_R", "RiderChest", L["r_shoulder_R"], L["r_elbow_R"]),
         ("RiderForeArm_R", "RiderArm_R", L["r_elbow_R"], L["r_wrist_R"]),
         ("RiderHand_R", "RiderForeArm_R", L["r_wrist_R"], L["r_hand_R"]),
         ("RiderArm_L", "RiderChest", L["r_shoulder_L"], L["r_elbow_L"]),
         ("RiderForeArm_L", "RiderArm_L", L["r_elbow_L"], L["r_wrist_L"]),
         ("RiderHand_L", "RiderForeArm_L", L["r_wrist_L"], L["r_hand_L"]),
         ("RiderCape1", "RiderChest", L["r_cape0"], L["r_cape1"]),
         ("RiderCape2", "RiderCape1", L["r_cape1"], L["r_cape2"])]
    for leg, par in (("FL", "Spine2"), ("FR", "Spine2"), ("HL", "Pelvis"), ("HR", "Pelvis")):
        B += _leg(f"Leg{leg}_", par, *L[f"leg_{leg}"])
    return B


def elephant_bones(L):
    B = [("Root", None, (0, 0, 0), (0, 0, 0.25)),
         ("Pelvis", "Root", L["rump"], L["back"]),
         ("Spine1", "Pelvis", L["back"], L["withers"]),
         ("Neck", "Spine1", L["withers"], L["neck"]),
         ("Head", "Neck", L["neck"], L["head"]),
         ("Trunk1", "Head", L["trunk0"], L["trunk1"]),
         ("Trunk2", "Trunk1", L["trunk1"], L["trunk2"]),
         ("Trunk3", "Trunk2", L["trunk2"], L["trunk3"]),
         ("Trunk4", "Trunk3", L["trunk3"], L["trunk4"]),
         ("Ear_L", "Head", L["ear_L0"], L["ear_L1"]),
         ("Ear_R", "Head", L["ear_R0"], L["ear_R1"]),
         ("Tail1", "Pelvis", L["tail0"], L["tail1"]),
         ("Tail2", "Tail1", L["tail1"], L["tail2"]),
         ("Howdah", "Spine1", L["howdah0"], L["howdah1"])]
    for leg, par in (("FL", "Spine1"), ("FR", "Spine1"), ("HL", "Pelvis"), ("HR", "Pelvis")):
        B += _leg(f"Leg{leg}_", par, *L[f"leg_{leg}"], names=("Upper", "Lower", "Foot", "Sole"))
    return B


# Bone families for fused-region separation, and which families must never share a seam.
def families(kind):
    if kind == "horse":
        fam = {"RiderSpine": "RIDER_LOW", "RiderChest": "RIDER", "RiderNeck": "RIDER", "RiderHead": "RIDER",
               "RiderArm_R": "RIDER_ARM", "RiderForeArm_R": "RIDER_ARM", "RiderHand_R": "RIDER_ARM",
               "RiderArm_L": "RIDER_ARM", "RiderForeArm_L": "RIDER_ARM", "RiderHand_L": "RIDER_ARM",
               "RiderCape1": "CAPE", "RiderCape2": "CAPE",
               "Neck1": "NECKHEAD", "Neck2": "NECKHEAD", "Head": "NECKHEAD",
               "Tail1": "TAIL", "Tail2": "TAIL", "Tail3": "TAIL"}
        for leg in ("FL", "FR", "HL", "HR"):
            for p in ("Upper", "Fore", "Cannon", "Hoof"):
                fam[f"Leg{leg}_{p}"] = f"LEG_{leg}"
        legs = [f"LEG_{l}" for l in ("FL", "FR", "HL", "HR")]
        bad = {frozenset(p) for p in
               [("RIDER_ARM", l) for l in legs] + [("CAPE", l) for l in legs] + [("RIDER", l) for l in legs] +
               [("TAIL", l) for l in legs] + [("CAPE", "TAIL"), ("RIDER_ARM", "TAIL"), ("RIDER", "TAIL"),
                                              ("RIDER_ARM", "NECKHEAD"), ("RIDER_ARM", "CAPE"), ("RIDER_ARM", "RIDER_LOW"),
                                              ("RIDER_LOW", "TAIL")] + [("RIDER_LOW", l) for l in legs] + [
                                              ("CAPE", "NECKHEAD"), ("RIDER_ARM", "BODY"),
                                              ("CAPE", "BODY")] +   # the rider's cape drapes over the croup, fused
               [(a, b) for a in legs for b in legs if a < b]}
        return fam, bad
    fam = {"Trunk1": "TRUNK", "Trunk2": "TRUNK", "Trunk3": "TRUNK", "Trunk4": "TRUNK",
           "Ear_L": "EAR", "Ear_R": "EAR", "Tail1": "TAIL", "Tail2": "TAIL", "Head": "HEAD", "Neck": "HEAD"}
    for leg in ("FL", "FR", "HL", "HR"):
        for p in ("Upper", "Lower", "Foot", "Sole"):
            fam[f"Leg{leg}_{p}"] = f"LEG_{leg}"
    legs = [f"LEG_{l}" for l in ("FL", "FR", "HL", "HR")]
    bad = {frozenset(p) for p in [("TRUNK", l) for l in legs] + [("TAIL", l) for l in legs] + [("EAR", l) for l in legs] +
           [("HEAD", l) for l in legs] +
           [("TRUNK", "EAR")] + [(a, b) for a in legs for b in legs if a < b]}
    return fam, bad


# ---------------------------------------------------------------- landmarks
LANDMARKS = {
    "SUN_Knight": {
        "kind": "horse",
        "skirt_z": 0.75,   # body-labelled faces below this are the caparison skirt (never follow the legs)
        "rump": (0, 0.32, 1.02), "back": (0, 0.0, 1.05), "chest": (0, -0.30, 1.12), "withers": (-0.01, -0.50, 1.20),
        "neck": (-0.03, -0.65, 1.38), "poll": (-0.05, -0.80, 1.52), "muzzle": (-0.06, -0.95, 1.20),
        "tail0": (0, 0.42, 1.00), "tail1": (0, 0.62, 0.70), "tail2": (0, 0.72, 0.52), "tail3": (0, 0.78, 0.36),
        "saddle0": (0.10, -0.05, 1.10), "saddle1": (0.10, 0.15, 1.10),
        "r_hips": (0.23, -0.02, 1.15), "r_chest": (0.23, -0.02, 1.35), "r_neck": (0.21, -0.03, 1.56),
        "r_head": (0.20, -0.03, 1.63), "r_head_top": (0.20, -0.02, 1.88),
        "r_shoulder_R": (0.13, 0.0, 1.50), "r_elbow_R": (-0.02, 0.10, 1.28), "r_wrist_R": (-0.20, 0.18, 1.10), "r_hand_R": (-0.28, 0.22, 1.07),
        "r_shoulder_L": (0.34, -0.03, 1.50), "r_elbow_L": (0.35, -0.20, 1.38), "r_wrist_L": (0.31, -0.35, 1.34), "r_hand_L": (0.28, -0.42, 1.33),
        "r_cape0": (0.20, 0.12, 1.52), "r_cape1": (0.22, 0.35, 1.20), "r_cape2": (0.24, 0.60, 0.85),
        "leg_FR": [(-0.10, -0.48, 0.92), (-0.11, -0.58, 0.72), (-0.13, -0.68, 0.50), (-0.13, -0.62, 0.33), (-0.13, -0.58, 0.27)],
        "leg_FL": [(0.08, -0.45, 0.92), (0.07, -0.45, 0.68), (0.06, -0.43, 0.40), (0.06, -0.43, 0.12), (0.06, -0.42, 0.01)],
        "leg_HR": [(-0.12, 0.28, 0.95), (-0.18, 0.22, 0.70), (-0.26, 0.36, 0.42), (-0.28, 0.34, 0.12), (-0.29, 0.34, 0.01)],
        "leg_HL": [(0.12, 0.25, 0.95), (0.18, 0.12, 0.70), (0.22, 0.10, 0.40), (0.24, 0.03, 0.12), (0.24, 0.02, 0.01)],
        # sabre held out to the horse's right; line fitted to the blade vertices (x < -0.6)
        "rigid": [("RiderHand_R", "x < -0.30 and abs(y - (0.306 * x + 0.311)) < 0.045 and abs(z - (0.441 * x + 1.197)) < 0.05")],
    },
    "SUN_Rook": {
        "kind": "elephant",
        "skirt_z": 0.60,
        "rump": (0, 0.45, 1.10), "back": (0, 0.10, 1.20), "withers": (0, -0.25, 1.22), "neck": (0, -0.45, 1.12), "head": (0, -0.68, 1.02),
        "trunk0": (0, -0.72, 0.95), "trunk1": (0, -0.77, 0.68), "trunk2": (0, -0.73, 0.45), "trunk3": (0, -0.64, 0.32), "trunk4": (0, -0.55, 0.30),
        "ear_L0": (0.22, -0.48, 1.12), "ear_L1": (0.42, -0.42, 0.85), "ear_R0": (-0.22, -0.48, 1.12), "ear_R1": (-0.42, -0.42, 0.85),
        "tail0": (0, 0.65, 0.95), "tail1": (0, 0.75, 0.70), "tail2": (0, 0.85, 0.50),
        "howdah0": (0, 0.05, 1.22), "howdah1": (0, 0.05, 1.55),
        "leg_FR": [(-0.22, -0.40, 0.95), (-0.24, -0.45, 0.62), (-0.24, -0.52, 0.32), (-0.23, -0.54, 0.10), (-0.23, -0.54, 0.0)],
        "leg_FL": [(0.20, -0.30, 0.95), (0.20, -0.20, 0.62), (0.20, -0.07, 0.30), (0.20, 0.0, 0.08), (0.20, 0.0, 0.0)],
        "leg_HR": [(-0.19, 0.35, 0.95), (-0.19, 0.40, 0.60), (-0.19, 0.50, 0.32), (-0.19, 0.54, 0.08), (-0.19, 0.54, 0.0)],
        "leg_HL": [(0.14, 0.40, 0.95), (0.14, 0.52, 0.60), (0.13, 0.68, 0.32), (0.13, 0.74, 0.08), (0.13, 0.74, 0.0)],
        "rigid": [
            ("Howdah", "z > 1.22 and y > -0.33"),                               # howdah, mahout, spear, banner
            ("Head", "y < -0.70 and 0.60 < z < 0.86 and abs(x) > 0.06"),        # tusks
        ],
        "zones": [("TRUNK", "y < -0.60 and 0.15 < z < 0.88 and abs(x) < (0.14 if z > 0.45 else 0.09)", "(z - 0.66) / 0.20")],
    },
    "SHADOW_Knight": {
        "kind": "horse",
        "skirt_z": 0.75,
        "rump": (-0.03, 0.35, 1.02), "back": (-0.04, 0.0, 1.05), "chest": (-0.06, -0.30, 1.12), "withers": (-0.10, -0.48, 1.22),
        "neck": (-0.18, -0.62, 1.40), "poll": (-0.27, -0.78, 1.55), "muzzle": (-0.30, -0.87, 1.21),
        "tail0": (-0.02, 0.45, 1.00), "tail1": (0.0, 0.62, 0.72), "tail2": (0.02, 0.72, 0.52), "tail3": (0.03, 0.80, 0.36),
        "saddle0": (-0.02, -0.05, 1.12), "saddle1": (-0.02, 0.18, 1.12),
        "r_hips": (0.0, 0.08, 1.18), "r_chest": (0.0, 0.08, 1.38), "r_neck": (-0.01, 0.09, 1.58),
        "r_head": (-0.01, 0.09, 1.65), "r_head_top": (-0.01, 0.09, 1.88),
        "r_shoulder_R": (-0.11, 0.07, 1.50), "r_elbow_R": (-0.22, 0.20, 1.28), "r_wrist_R": (-0.34, 0.30, 1.12), "r_hand_R": (-0.42, 0.355, 1.065),
        "r_shoulder_L": (0.11, 0.07, 1.50), "r_elbow_L": (0.14, -0.10, 1.40), "r_wrist_L": (0.10, -0.28, 1.36), "r_hand_L": (0.03, -0.36, 1.36),
        "r_cape0": (0.0, 0.20, 1.52), "r_cape1": (0.0, 0.42, 1.15), "r_cape2": (0.0, 0.68, 0.80),
        "leg_FR": [(-0.16, -0.45, 0.92), (-0.20, -0.55, 0.70), (-0.25, -0.62, 0.45), (-0.26, -0.55, 0.28), (-0.26, -0.50, 0.22)],
        "leg_FL": [(0.0, -0.43, 0.92), (-0.02, -0.43, 0.68), (-0.03, -0.40, 0.40), (-0.04, -0.38, 0.12), (-0.04, -0.37, 0.01)],
        "leg_HR": [(-0.10, 0.32, 0.95), (-0.10, 0.30, 0.70), (-0.06, 0.50, 0.40), (-0.04, 0.54, 0.12), (-0.03, 0.54, 0.01)],
        "leg_HL": [(0.08, 0.28, 0.95), (0.12, 0.18, 0.70), (0.11, 0.15, 0.40), (0.10, 0.10, 0.12), (0.10, 0.10, 0.01)],
        # sabre: line fitted to the blade vertices (x < -0.62)
        "rigid": [("RiderHand_R", "x < -0.40 and abs(y - (0.379 * x + 0.515)) < 0.045 and abs(z - (0.48 * x + 1.266)) < 0.05")],
    },
    "SHADOW_Rook": {
        "kind": "elephant",
        "skirt_z": 0.60,
        "rump": (0, 0.45, 1.08), "back": (0, 0.10, 1.20), "withers": (0, -0.25, 1.20), "neck": (0, -0.45, 1.10), "head": (0, -0.66, 1.00),
        "trunk0": (0, -0.74, 0.92), "trunk1": (0, -0.80, 0.66), "trunk2": (0, -0.80, 0.45), "trunk3": (0, -0.76, 0.30), "trunk4": (0, -0.71, 0.23),
        "ear_L0": (0.22, -0.48, 1.10), "ear_L1": (0.40, -0.42, 0.82), "ear_R0": (-0.22, -0.48, 1.10), "ear_R1": (-0.40, -0.42, 0.82),
        "tail0": (0, 0.62, 0.95), "tail1": (0, 0.72, 0.68), "tail2": (0, 0.80, 0.40),
        "howdah0": (0, 0.05, 1.20), "howdah1": (0, 0.05, 1.52),
        "leg_FR": [(-0.20, -0.40, 0.95), (-0.20, -0.46, 0.62), (-0.19, -0.53, 0.32), (-0.18, -0.56, 0.10), (-0.18, -0.56, 0.0)],
        "leg_FL": [(0.20, -0.30, 0.95), (0.20, -0.22, 0.62), (0.20, -0.12, 0.32), (0.20, -0.07, 0.10), (0.20, -0.07, 0.0)],
        "leg_HR": [(-0.19, 0.35, 0.92), (-0.20, 0.38, 0.60), (-0.21, 0.44, 0.32), (-0.21, 0.46, 0.10), (-0.21, 0.46, 0.0)],
        "leg_HL": [(0.15, 0.38, 0.92), (0.15, 0.45, 0.60), (0.14, 0.52, 0.32), (0.14, 0.54, 0.10), (0.14, 0.54, 0.0)],
        "rigid": [
            ("Howdah", "z > 1.18 and y > -0.33"),                               # howdah, mahout, spear, banner
            ("Head", "y < -0.72 and 0.58 < z < 0.84 and abs(x) > 0.08"),        # tusks
        ],
        "zones": [("TRUNK", "y < -0.62 and 0.12 < z < 0.86 and abs(x) < (0.14 if z > 0.45 else 0.09)", "(z - 0.64) / 0.20")],
    },
}

# Animal test poses (game-range): walk/gallop stride, attack (charge / rear / trunk swing), turn.
def test_poses(kind):
    r = math.radians
    if kind == "horse":
        return {
            "rest": {},
            "gallop": {"LegFL_Upper": (r(-30), 0, 0), "LegFL_Fore": (r(40), 0, 0), "LegFR_Upper": (r(25), 0, 0),
                       "LegHL_Upper": (r(25), 0, 0), "LegHR_Upper": (r(-25), 0, 0), "LegHR_Cannon": (r(-25), 0, 0),
                       "Neck1": (r(10), 0, 0), "Tail1": (r(-20), 0, 0)},
            "attack": {"Pelvis": (r(-12), 0, 0), "Spine1": (r(-8), 0, 0), "Neck1": (r(-15), 0, 0), "LegFL_Upper": (r(-45), 0, 0),
                       "LegFL_Fore": (r(60), 0, 0), "RiderArm_R": (r(60), 0, 0), "RiderForeArm_R": (r(30), 0, 0),
                       "RiderSpine": (r(10), r(-15), 0)},
            "turn": {"Neck1": (0, 0, r(20)), "Neck2": (0, 0, r(15)), "Head": (r(10), 0, r(10)), "Tail1": (0, 0, r(25)),
                     "RiderSpine": (0, r(20), 0), "RiderHead": (0, r(-25), 0), "RiderCape1": (r(20), 0, 0)},
        }
    return {
        "rest": {},
        "walk": {"LegFR_Upper": (r(-15), 0, 0), "LegFL_Upper": (r(15), 0, 0), "LegHR_Upper": (r(12), 0, 0),
                 "LegHL_Upper": (r(-12), 0, 0), "LegFL_Lower": (r(-15), 0, 0), "Trunk2": (r(10), 0, 0), "Tail1": (0, 0, r(15))},
        "attack": {"Neck": (r(-12), 0, 0), "Trunk1": (r(-35), 0, 0), "Trunk2": (r(-30), 0, 0), "Trunk3": (r(-25), 0, 0),
                   "Ear_L": (0, 0, r(-25)), "Ear_R": (0, 0, r(25)), "LegFR_Upper": (r(-20), 0, 0)},
        "turn": {"Neck": (0, 0, r(15)), "Head": (0, 0, r(10)), "Trunk1": (0, 0, r(20)), "Tail1": (0, 0, r(25)), "Pelvis": (0, 0, r(5))},
    }


# ---------------------------------------------------------------- build + bind
def build_rig(scene, mesh_obj, name):
    L = LANDMARKS[name]
    bones = horse_bones(L) if L["kind"] == "horse" else elephant_bones(L)
    rname = f"{mesh_obj.name}_Rig"
    old = bpy.data.objects.get(rname)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    arm = bpy.data.armatures.new(rname)
    rig = bpy.data.objects.new(rname, arm)
    scene.collection.objects.link(rig)
    bpy.context.window.scene = scene
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.edit_bones
    for bname, parent, h, t in bones:
        b = eb.new(bname)
        b.head, b.tail = Vector(h), Vector(t)
        if parent:
            b.parent = eb[parent]
            b.use_connect = (eb[parent].tail - b.head).length < 1e-4
        b.use_deform = bname != "Root"
    for b in eb:
        b.align_roll(Vector((1, 0, 0)) if abs(b.vector.normalized().x) < 0.9 else Vector((0, 0, 1)))
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


def bind(scene, mesh_obj, rig, name):
    """Heat weights → rigid props → smoothing → fused-region separation → ≤4 influences."""
    import bmesh
    from collections import Counter
    from mathutils.geometry import intersect_point_line as _ipl
    L = LANDMARKS[name]
    FAMILY, BAD = families(L["kind"])
    mesh_obj.vertex_groups.clear()
    for m in list(mesh_obj.modifiers):
        if m.type == 'ARMATURE':
            mesh_obj.modifiers.remove(m)
    mesh_obj.parent = None
    for o in scene.objects:
        o.select_set(False)
    mesh_obj.select_set(True); rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    with bpy.context.temp_override(selected_editable_objects=[mesh_obj, rig], active_object=rig, object=rig):
        bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    me = mesh_obj.data
    vg = {g.name: g for g in mesh_obj.vertex_groups}
    for b in rig.data.bones:
        if b.use_deform and b.name not in vg:
            vg[b.name] = mesh_obj.vertex_groups.new(name=b.name)

    rigid_idx, rigid_count = set(), {}
    for bone, cond in L["rigid"]:
        f = eval(f"lambda x, y, z: {cond}")
        idx = [v.index for v in me.vertices if f(*v.co)]
        for g in mesh_obj.vertex_groups:
            g.remove(idx)
        vg[bone].add(idx, 1.0, 'REPLACE')
        rigid_idx.update(idx); rigid_count[bone] = len(idx)

    def ctx(fn):
        with bpy.context.temp_override(object=mesh_obj, active_object=mesh_obj, selected_editable_objects=[mesh_obj]):
            bpy.context.view_layer.objects.active = mesh_obj
            fn()
    for v in me.vertices:
        v.select = v.index not in rigid_idx
    me.use_paint_mask_vertex = True
    def _smooth():
        bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
        bpy.ops.object.vertex_group_smooth(group_select_mode='ALL', factor=0.5, repeat=3, expand=0.0)
        bpy.ops.object.mode_set(mode='OBJECT')
    ctx(_smooth)
    me.use_paint_mask_vertex = False

    # Weight zones: geometry that may only be driven by one bone family, faded in smoothly
    # (e.g. the hanging trunk column loses its head weights gradually below the trunk root,
    # otherwise it tears from the tusk roots when it swings).
    for fam_name, cond, fade in L.get("zones", []):
        f = eval(f"lambda x, y, z: {cond}")
        k = eval(f"lambda x, y, z: max(0.0, min(1.0, {fade}))")   # 1 = keep other weights, 0 = remove
        fam_idx = {g.index for g in mesh_obj.vertex_groups if FAMILY.get(g.name) == fam_name}
        fam_bones = [b for b in rig.data.bones if FAMILY.get(b.name) == fam_name]
        leg_idx = {g.index for g in mesh_obj.vertex_groups if FAMILY.get(g.name, "").startswith("LEG_")}
        for v in me.vertices:
            if v.index in rigid_idx or not f(*v.co):
                continue
            if v.groups and max(v.groups, key=lambda e: e.weight).group in leg_idx:
                continue   # never pull a foot into the trunk
            keep = k(*v.co)
            for e in list(v.groups):
                if e.group not in fam_idx:
                    e.weight *= keep
            if not any(e.weight > 1e-4 for e in v.groups if e.group in fam_idx):
                bn = min(fam_bones, key=lambda b: (v.co - (b.head_local + b.tail_local) / 2).length)
                mesh_obj.vertex_groups[bn.name].add([v.index], max(1e-3, 1.0 - keep), 'REPLACE')

    gname = {g.index: g.name for g in mesh_obj.vertex_groups}
    gindex = {v: k for k, v in gname.items()}
    fam_of = lambda gi: FAMILY.get(gname[gi], "BODY")
    def is_bad(a, b):
        ab = lambda f: f[2:] if f.startswith("P:") else f
        if frozenset((ab(a), ab(b))) in BAD:
            return True
        # the caparison skirt is body cloth: it inherits every body rule as well
        sb = lambda f: "BODY" if ab(f) == "SKIRT" else ab(f)
        if (ab(a) == "SKIRT" or ab(b) == "SKIRT") and frozenset((sb(a), sb(b))) in BAD:
            return True
        for p, o in ((a, b), (b, a)):
            if p.startswith("P:") and not o.startswith("P:") and ab(o) != ab(p):
                return True   # a fused prop parts from every other region except its own bone family
        return False
    BAD = BAD | {frozenset(("SKIRT", l)) for l in set(FAMILY.values()) if l.startswith("LEG_")}
    ALL = set(FAMILY.values()) | {"BODY", "SKIRT"}

    bm = bmesh.new(); bm.from_mesh(me)
    dl = bm.verts.layers.deform.verify()
    vf = {v: (fam_of(max(v[dl].items(), key=lambda kv: kv[1])[0]) if len(v[dl]) else "BODY") for v in bm.verts}
    face_fam = {}
    for f in bm.faces:
        rv = [v for v in f.verts if v.index in rigid_idx]
        fam = ("P:" + vf[rv[0]]) if rv else Counter(vf[v] for v in f.verts).most_common(1)[0][0]
        if fam == "BODY" and f.calc_center_median().z < L.get("skirt_z", 0):
            fam = "SKIRT"
        face_fam[f] = fam
    split = [e for e in bm.edges if len(e.link_faces) == 2 and is_bad(face_fam[e.link_faces[0]], face_fam[e.link_faces[1]])]
    if split:
        bmesh.ops.split_edges(bm, edges=split)
    empty = []
    for v in bm.verts:
        if v.index in rigid_idx:
            continue
        fams = {face_fam[f] for f in v.link_faces if f in face_fam}
        banned = {x for f in fams for x in ALL if is_bad(f, x)}
        w = v[dl]
        for gi in [gi for gi in w.keys() if fam_of(gi) in banned]:
            del w[gi]
        if not len(w):
            empty.append((v, banned))
    for _ in range(6):
        nxt = []
        for v, banned in empty:
            acc = Counter()
            for e in v.link_edges:
                for gi, wt in e.other_vert(v)[dl].items():
                    if fam_of(gi) not in banned:
                        acc[gi] += wt
            if acc:
                t = sum(acc.values())
                for gi, wt in acc.items():
                    v[dl][gi] = wt / t
            else:
                nxt.append((v, banned))
        empty = nxt
    dbones = [b for b in rig.data.bones if b.use_deform]
    for v, banned in empty:
        pool = [b for b in dbones if FAMILY.get(b.name, "BODY") not in banned] or dbones
        def d(b):
            q, t = _ipl(v.co, b.head_local, b.tail_local); t = min(1.0, max(0.0, t))
            return (v.co - (b.head_local + (b.tail_local - b.head_local) * t)).length
        v[dl][gindex[min(pool, key=d).name]] = 1.0
    bm.to_mesh(me); bm.free(); me.update()

    def _limit():
        bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
        bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
    ctx(_limit)
    unweighted = sum(1 for v in me.vertices if not any(g.weight > 1e-4 for g in v.groups))
    return {"unweighted": unweighted, "rigid": rigid_count, "split_edges": len(split)}


def rig_animal(name, helpers_path, out_dir):
    H = _load_humanoid_helpers(helpers_path)
    home = bpy.context.window.scene
    sc = bpy.data.scenes[f"PREP_{name}"]; bpy.context.window.scene = sc
    mesh = sc.objects[name]
    rig = build_rig(sc, mesh, name)
    info = bind(sc, mesh, rig, name)
    poses = test_poses(LANDMARKS[name]["kind"])
    qa = H["stretch_report"](rig, mesh, poses)
    H["pose_test"](sc, rig, mesh, out_dir, name, poses)
    H["joint_overlay"](sc, rig, mesh, os.path.join(out_dir, f"{name}__joints.png"))
    bpy.context.window.scene = home
    ne = len(mesh.data.edges)
    game = {k: v for k, v in qa.items() if k != "rest"}
    passed = all(v["visible_tear_edges"] / ne < 0.01 and v["max_elongation_mm"] < 80 for v in game.values())
    return {"name": name, "bones": len(rig.data.bones), **info,
            "qa": {k: (v["visible_tear_edges"], v["max_elongation_mm"]) for k, v in game.items()}, "pass": passed}


def diagnose(name, pose_name, top=4):
    import numpy as np
    from collections import Counter
    home = bpy.context.window.scene
    sc = bpy.data.scenes[f"PREP_{name}"]; bpy.context.window.scene = sc
    rig, mesh = sc.objects[f"{name}_Rig"], sc.objects[name]
    me = mesh.data
    names = {g.index: g.name for g in mesh.vertex_groups}
    wd = lambda v: {names[e.group]: round(e.weight, 2) for e in v.groups if e.weight > 0.02}
    e = np.empty(len(me.edges) * 2, dtype=np.int64); me.edges.foreach_get("vertices", e); e = e.reshape(-1, 2)
    rest = np.empty(len(me.vertices) * 3); me.vertices.foreach_get("co", rest); rest = rest.reshape(-1, 3)
    rl = np.linalg.norm(rest[e[:, 0]] - rest[e[:, 1]], axis=1)
    pose = test_poses(LANDMARKS[name]["kind"])[pose_name]
    for pb in rig.pose.bones:
        pb.rotation_mode = 'XYZ'; pb.rotation_euler = pose.get(pb.name, (0, 0, 0))
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); ev = mesh.evaluated_get(dg).to_mesh()
    co = np.empty(len(ev.vertices) * 3); ev.vertices.foreach_get("co", co); co = co.reshape(-1, 3); mesh.evaluated_get(dg).to_mesh_clear()
    L_ = np.linalg.norm(co[e[:, 0]] - co[e[:, 1]], axis=1); grow = L_ - rl; r = L_ / (rl + 1e-9)
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
