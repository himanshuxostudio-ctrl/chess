"""
Phase 6 — animation library + GLB export for Ancient Warfare Chess.

Clips are authored as WORLD-SEMANTIC rotations (axis in board space: X = character's left,
Y = backwards, Z = up) and converted into each bone's rest frame, so "swing forward" means the
same thing on every rig regardless of bone roll. Conventions (right-hand rule):
  X+ : a limb hanging down swings BACKWARD; a spine/neck pitches FORWARD (top towards −Y).
  Z+ : turn to the character's LEFT (yaw).   Y+ : roll so the top leans to the character's RIGHT.

Every clip keys EVERY deforming bone on its first and last frame, so switching clips in a
three.js AnimationMixer never leaves a bone stuck in the previous clip's pose.
Clips are pushed to NLA tracks and exported with export_animation_mode='NLA_TRACKS'.
"""
import bpy, os, math, json
from mathutils import Quaternion, Vector

FPS = 30


def wq(bone, axis, deg):
    """World-axis rotation expressed in the bone's rest frame (armature at identity)."""
    B = bone.bone.matrix_local.to_quaternion()
    ax = {"X": Vector((1, 0, 0)), "Y": Vector((0, 1, 0)), "Z": Vector((0, 0, 1))}[axis]
    return B.inverted() @ Quaternion(ax, math.radians(deg)) @ B


def pose_q(pb, rots):
    q = Quaternion()
    for axis, deg in rots:
        q = wq(pb, axis, deg) @ q
    return q


def make_clip(rig, name, length, keys, loop=True):
    """keys: {bone: [(frame, [(axis, deg), ...]), ...]}. Unlisted deform bones are keyed at rest."""
    act = bpy.data.actions.get(f"{rig.name}|{name}")
    if act:
        bpy.data.actions.remove(act)
    rig.animation_data_create()
    rig.animation_data.action = None
    act = bpy.data.actions.new(f"{rig.name}|{name}")
    rig.animation_data.action = act
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    for pb in rig.pose.bones:
        locs = keys.get(f"{pb.name}@loc")
        if locs:
            R = pb.bone.matrix_local.to_3x3().inverted()
            for f, d in locs:
                pb.location = R @ Vector(d)
                pb.keyframe_insert("location", frame=f)
    for pb in rig.pose.bones:
        frames = keys.get(pb.name)
        if not frames:
            frames = [(0, []), (length, [])]
        elif loop and frames[-1][0] != length:
            frames = frames + [(length, frames[0][1])]
        for f, rots in frames:
            pb.rotation_quaternion = pose_q(pb, rots)
            pb.keyframe_insert("rotation_quaternion", frame=f)
        if f"{pb.name}@loc" not in keys:
            pb.location = (0, 0, 0)
            pb.keyframe_insert("location", frame=0)
        pb.location = (0, 0, 0)
    rig.animation_data.action = None
    tr = rig.animation_data.nla_tracks.get(name) or rig.animation_data.nla_tracks.new()
    tr.name = name
    for s in list(tr.strips):
        tr.strips.remove(s)
    strip = tr.strips.new(name, 0, act)
    strip.action_frame_end = length
    for pb in rig.pose.bones:
        pb.rotation_quaternion = Quaternion()
    return act


def cyc(n, a, f=1.0, phase=0.0, steps=8, length=30):
    """Sine keys: n=axis, a=amplitude (deg), f cycles per clip."""
    return [(round(i * length / steps), [(n, a * math.sin(2 * math.pi * (f * i / steps + phase)))]) for i in range(steps + 1)]


# ------------------------------------------------------------------ humanoid clips
ATTACK_STYLE = {"Pawn": "thrust", "Queen": "slash", "King": "royal", "Bishop": "staff"}


def humanoid_clips(rig, piece):
    clips = {}
    L, R = "Left", "Right"
    # Idle — breathing, slight head look, cape sway (2 s loop)
    clips["Idle"] = (60, {
        "Spine1": cyc("X", 1.8, length=60), "Spine2": cyc("X", 1.2, phase=0.1, length=60),
        "Head": [(0, [("Z", 0)]), (20, [("Z", 7)]), (40, [("Z", -5)]), (60, [("Z", 0)])],
        f"{L}Arm": cyc("X", 2.5, phase=0.2, length=60), f"{R}Arm": cyc("X", -2.5, phase=0.2, length=60),
        "Cape2": cyc("X", 3, phase=0.3, length=60), "Cape3": cyc("X", 4, phase=0.35, length=60),
        "CapeL2": cyc("X", 3, phase=0.4, length=60), "CapeR2": cyc("X", 3, phase=0.25, length=60),
    })
    # Walk — in place (the game moves the root), 1 s, two steps
    W = 30
    clips["Walk"] = (W, {
        f"{L}UpLeg": cyc("X", -20, length=W), f"{R}UpLeg": cyc("X", 20, length=W),
        f"{L}Leg": [(i * W // 8, [("X", max(0.0, 30 * math.sin(2 * math.pi * i / 8 + 1.2)))]) for i in range(9)],
        f"{R}Leg": [(i * W // 8, [("X", max(0.0, 30 * math.sin(2 * math.pi * i / 8 + 1.2 + math.pi)))]) for i in range(9)],
        f"{L}Arm": cyc("X", 10, length=W), f"{R}Arm": cyc("X", -8, length=W),
        "Spine1": cyc("Z", 4, length=W), "Hips": cyc("Z", -3, length=W),
        "Cape1": [(0, [("X", 10)]), (15, [("X", 13)]), (30, [("X", 10)])],
        "Cape2": cyc("X", 6, f=2, length=W), "Cape3": cyc("X", 8, f=2, phase=0.1, length=W),
    })
    # Attack — 0.9 s: wind-up, strike, recover
    A = 27
    style = ATTACK_STYLE.get(piece, "slash")
    arm = {
        # spear held upright: rotating the arm forward would tip the spear backwards, so the forearm
        # counter-rotates to bring the tip down to level and drive it forward
        "thrust": {f"{R}Arm": [(0, []), (8, [("X", 20)]), (13, [("X", -45)]), (20, [("X", -35)]), (A, [])],
                   f"{R}ForeArm": [(0, []), (8, [("X", 40)]), (13, [("X", 125)]), (20, [("X", 110)]), (A, [])],
                   f"{L}Arm": [(0, []), (10, [("X", -35)]), (20, [("X", -30)]), (A, [])]},
        "slash": {f"{R}Arm": [(0, []), (9, [("X", -150), ("Y", -20)]), (14, [("X", -40), ("Y", 10)]), (20, [("X", -30)]), (A, [])],
                  f"{R}ForeArm": [(0, []), (9, [("X", -40)]), (14, [("X", -5)]), (A, [])],
                  f"{L}Arm": [(0, []), (10, [("X", -40)]), (20, [("X", -35)]), (A, [])]},
        "royal": {f"{R}Arm": [(0, []), (9, [("X", -100)]), (14, [("X", -70)]), (A, [])],
                  f"{R}ForeArm": [(0, []), (9, [("X", -50)]), (14, [("X", -10)]), (A, [])],
                  f"{L}Arm": [(0, []), (12, [("X", 15)]), (A, [])]},
        "staff": {f"{R}Arm": [(0, []), (9, [("X", -110)]), (14, [("X", -40)]), (20, [("X", -35)]), (A, [])],
                  f"{R}ForeArm": [(0, []), (9, [("X", -10)]), (14, [("X", 70)]), (20, [("X", 55)]), (A, [])]},
    }[style]
    clips["Attack"] = (A, {**arm,
        "Spine1": [(0, []), (9, [("Z", 15), ("X", -5)]), (14, [("Z", -12), ("X", 10)]), (A, [])],
        "Spine2": [(0, []), (9, [("Z", 8)]), (14, [("Z", -8)]), (A, [])],
        f"{L}UpLeg": [(0, []), (12, [("X", -18)]), (20, [("X", -12)]), (A, [])],
        f"{L}Leg": [(0, []), (12, [("X", 15)]), (A, [])],
        "Cape2": [(0, []), (14, [("X", 15)]), (A, [])], "Cape3": [(0, []), (14, [("X", 20)]), (A, [])],
    }, False)
    # Hit — 0.5 s recoil
    H = 15
    clips["Hit"] = (H, {
        "Spine1": [(0, []), (4, [("X", -8)]), (H, [])], "Spine2": [(0, []), (4, [("X", -5)]), (H, [])],
        "Head": [(0, []), (4, [("X", -10), ("Z", 8)]), (H, [])],
        f"{L}Arm": [(0, []), (4, [("X", -20)]), (H, [])], f"{R}Arm": [(0, []), (4, [("X", -8)]), (H, [])],
        f"{L}UpLeg": [(0, []), (5, [("X", 10)]), (H, [])],
    }, False)
    # Death — 1.5 s: knees buckle, body folds (the game then topples and sinks the unit)
    D = 45
    clips["Death"] = (D, {
        # thigh 45° forward + knee 75°: with ~0.43 m thigh / 0.40 m shin the hips drop ~0.18 m and sit
        # ~0.09 m back for the feet to stay planted (the game then topples and sinks the unit)
        f"{L}UpLeg": [(0, []), (15, [("X", -25)]), (D, [("X", -45)])], f"{R}UpLeg": [(0, []), (15, [("X", -22)]), (D, [("X", -40)])],
        f"{L}Leg": [(0, []), (15, [("X", 40)]), (D, [("X", 75)])], f"{R}Leg": [(0, []), (15, [("X", 36)]), (D, [("X", 70)])],
        "Spine1": [(0, []), (15, [("X", 20)]), (D, [("X", 30)])], "Spine2": [(0, []), (D, [("X", 15)])],
        "Head": [(0, []), (10, [("X", -20)]), (D, [("X", 25)])],
        f"{L}Arm": [(0, []), (D, [("X", -25), ("Y", 20)])], f"{R}Arm": [(0, []), (D, [("X", -25), ("Y", -20)])],
        "Hips@loc": [(0, (0, 0, 0)), (15, (0, 0.04, -0.07)), (D, (0, 0.09, -0.18))],
    }, False)
    # Victory — 1.5 s, raise weapon / hand, chest out (holds last frame)
    V = 45
    upright = style in ("thrust", "staff")
    clips["Victory"] = (V, {
        f"{R}Arm": [(0, []), (15, [("X", -70 if upright else -165)]), (V, [("X", -65 if upright else -160)])],
        f"{R}ForeArm": [(0, []), (15, [("X", 55 if upright else -10)]), (V, [("X", 50 if upright else 0)])],
        "Spine1": [(0, []), (15, [("X", -8)]), (V, [("X", -6)])], "Head": [(0, []), (15, [("X", -12)]), (V, [("X", -10)])],
        "Cape2": [(0, []), (15, [("X", 12)]), (V, [("X", 8)])],
    }, False)
    # Defend — 1 s loop: guard up, slight crouch
    G = 30
    clips["Defend"] = (G, {
        f"{L}Arm": [(0, [("X", -40)]), (15, [("X", -44)]), (G, [("X", -40)])],
        f"{L}ForeArm": [(0, [("X", -25)]), (G, [("X", -25)])],
        f"{R}Arm": [(0, [("X", -20)]), (G, [("X", -20)])],
        f"{L}UpLeg": [(0, [("X", -14)]), (G, [("X", -14)])], f"{R}UpLeg": [(0, [("X", 10)]), (G, [("X", 10)])],
        f"{L}Leg": [(0, [("X", 22)]), (G, [("X", 22)])], f"{R}Leg": [(0, [("X", 18)]), (G, [("X", 18)])],
        "Spine1": cyc("X", 1.5, length=G),
    })
    return clips


# ------------------------------------------------------------------ horse + rider clips
def horse_clips(rig):
    legs = {"FL": 0.0, "FR": 0.5, "HL": 0.5, "HR": 0.0}   # trot: diagonal pairs
    clips = {}
    clips["Idle"] = (60, {
        "Neck1": cyc("X", 2.5, length=60), "Head": [(0, []), (25, [("X", 4), ("Z", 5)]), (45, [("Z", -3)]), (60, [])],
        "Tail1": cyc("Z", 8, length=60), "Tail2": cyc("Z", 10, phase=0.1, length=60),
        "Spine1": cyc("X", 0.8, f=2, length=60), "RiderSpine": cyc("X", 1.5, length=60),
        "RiderHead": [(0, []), (30, [("Z", 8)]), (60, [])], "RiderCape1": cyc("X", 3, length=60),
    })
    W = 36
    walk = {}
    for leg, ph in legs.items():
        walk[f"Leg{leg}_Upper"] = cyc("X", 18, phase=ph, length=W)
        walk[f"Leg{leg}_Cannon"] = [(i * W // 8, [("X", max(0.0, 35 * math.sin(2 * math.pi * (i / 8 + ph) + 1.0)))]) for i in range(9)]
    walk.update({"Neck1": cyc("X", 3, f=2, length=W), "Tail1": cyc("Z", 6, length=W), "RiderSpine": cyc("X", 2, f=2, length=W),
                 "RiderCape1": cyc("X", 5, f=2, length=W)})
    clips["Walk"] = (W, walk)
    G = 20
    gallop = {}
    for leg, ph in {"FL": 0.0, "FR": 0.12, "HL": 0.55, "HR": 0.62}.items():   # transverse gallop
        gallop[f"Leg{leg}_Upper"] = cyc("X", 34 if leg[0] == "F" else 30, phase=ph, length=G)
        gallop[f"Leg{leg}_Fore"] = [(i * G // 8, [("X", max(0.0, 45 * math.sin(2 * math.pi * (i / 8 + ph) + 1.3)))]) for i in range(9)]
    gallop.update({"Pelvis": cyc("X", 4, length=G), "Neck1": cyc("X", 8, phase=0.2, length=G), "Tail1": [(0, [("X", 25)]), (G, [("X", 25)])],
                   "RiderSpine": [(0, [("X", 14)]), (G, [("X", 14)])], "RiderCape1": [(0, [("X", 25)]), (10, [("X", 30)]), (G, [("X", 25)])],
                   "RiderCape2": cyc("X", 10, f=2, length=G)})
    clips["Gallop"] = (G, gallop)
    A = 36
    clips["Attack"] = (A, {   # rear and strike
        "Pelvis": [(0, []), (12, [("X", -22)]), (22, [("X", -18)]), (30, [("X", 4)]), (A, [])],
        "LegFL_Upper": [(0, []), (12, [("X", -45)]), (22, [("X", -40)]), (A, [])], "LegFL_Fore": [(0, []), (12, [("X", 70)]), (A, [])],
        "LegFR_Upper": [(0, []), (14, [("X", -40)]), (24, [("X", -35)]), (A, [])], "LegFR_Fore": [(0, []), (14, [("X", 65)]), (A, [])],
        "LegHL_Upper": [(0, []), (12, [("X", 22)]), (A, [])], "LegHR_Upper": [(0, []), (12, [("X", 20)]), (A, [])],
        "Neck1": [(0, []), (12, [("X", -12)]), (A, [])], "Tail1": [(0, []), (12, [("X", 20)]), (A, [])],
        "RiderSpine": [(0, []), (12, [("X", 18)]), (22, [("X", 8), ("Z", -15)]), (A, [])],
        "RiderArm_R": [(0, []), (14, [("X", -130)]), (22, [("X", -40)]), (A, [])],
        "RiderForeArm_R": [(0, []), (14, [("X", -30)]), (22, [("X", 0)]), (A, [])],
    }, False)
    H = 15
    clips["Hit"] = (H, {"Spine2": [(0, []), (4, [("Y", 6)]), (H, [])], "Neck1": [(0, []), (4, [("X", -14), ("Z", 12)]), (H, [])],
                        "RiderSpine": [(0, []), (4, [("X", -14)]), (H, [])], "RiderHead": [(0, []), (4, [("X", -12)]), (H, [])]}, False)
    D = 45
    death = {f"Leg{l}_Upper": [(0, []), (D, [("X", -30 if l[0] == "F" else 25)])] for l in ("FL", "FR", "HL", "HR")}
    death.update({f"Leg{l}_Fore": [(0, []), (D, [("X", 80)])] for l in ("FL", "FR", "HL", "HR")})
    death.update({"Pelvis@loc": [(0, (0, 0, 0)), (D, (0, 0, -0.35))],
                  "Neck1": [(0, []), (D, [("X", 30)])], "Head": [(0, []), (D, [("X", 20)])],
                  "RiderSpine": [(0, []), (D, [("X", -25), ("Y", 15)])], "RiderArm_R": [(0, []), (D, [("Y", -30)])]})
    clips["Death"] = (D, death, False)
    V = 45
    clips["Victory"] = (V, {"Neck1": [(0, []), (15, [("X", -15)]), (V, [("X", -12)])], "Head": [(0, []), (15, [("X", -10)]), (V, [])],
                            "RiderArm_R": [(0, []), (15, [("X", -165)]), (V, [("X", -160)])], "RiderSpine": [(0, []), (15, [("X", -8)]), (V, [])],
                            "LegFL_Upper": [(0, []), (10, [("X", -30)]), (20, []), (V, [])], "LegFL_Fore": [(0, []), (10, [("X", 60)]), (20, []), (V, [])]},
                        False)
    return clips


# ------------------------------------------------------------------ elephant clips
def elephant_clips(rig):
    clips = {}
    clips["Idle"] = (90, {
        "Ear_L": cyc("Z", 14, f=2, length=90), "Ear_R": cyc("Z", -14, f=2, phase=0.1, length=90),
        "Trunk1": cyc("Z", 6, length=90), "Trunk2": cyc("X", -6, phase=0.2, length=90), "Trunk3": cyc("X", -8, phase=0.3, length=90),
        "Trunk4": cyc("X", -10, phase=0.4, length=90), "Tail1": cyc("Z", 12, f=2, length=90), "Head": cyc("X", 2, length=90),
        "Spine1": cyc("X", 0.8, f=2, length=90),
    })
    W = 40
    walk = {}
    for leg, ph in {"FL": 0.0, "HR": 0.25, "FR": 0.5, "HL": 0.75}.items():   # lateral walk
        walk[f"Leg{leg}_Upper"] = cyc("X", 14, phase=ph, length=W)
        walk[f"Leg{leg}_Lower"] = [(i * W // 8, [("X", max(0.0, 20 * math.sin(2 * math.pi * (i / 8 + ph) + 1.0)))]) for i in range(9)]
    walk.update({"Head": cyc("X", 3, f=2, length=W), "Trunk2": cyc("X", -8, phase=0.1, length=W), "Trunk3": cyc("X", -10, phase=0.2, length=W),
                 "Ear_L": cyc("Z", 8, length=W), "Ear_R": cyc("Z", -8, length=W), "Tail1": cyc("Z", 10, length=W)})
    clips["Walk"] = (W, walk)
    A = 36
    clips["Attack"] = (A, {   # trunk raise + trumpet, front stomp
        "Trunk1": [(0, []), (12, [("X", -45)]), (20, [("X", -40)]), (28, [("X", 10)]), (A, [])],
        "Trunk2": [(0, []), (12, [("X", -40)]), (20, [("X", -35)]), (28, [("X", 10)]), (A, [])],
        "Trunk3": [(0, []), (12, [("X", -35)]), (20, [("X", -30)]), (28, [("X", 5)]), (A, [])],
        "Trunk4": [(0, []), (12, [("X", -30)]), (A, [])],
        "Ear_L": [(0, []), (10, [("Z", 30)]), (24, [("Z", 25)]), (A, [])], "Ear_R": [(0, []), (10, [("Z", -30)]), (24, [("Z", -25)]), (A, [])],
        "Pelvis": [(0, []), (12, [("X", -8)]), (24, [("X", 2)]), (A, [])],
        "LegFR_Upper": [(0, []), (12, [("X", -25)]), (24, [("X", 5)]), (A, [])], "LegFR_Lower": [(0, []), (12, [("X", 30)]), (24, []), (A, [])],
        "Head": [(0, []), (12, [("X", -10)]), (24, [("X", 5)]), (A, [])],
    }, False)
    H = 18
    clips["Hit"] = (H, {"Head": [(0, []), (5, [("X", -10), ("Z", 10)]), (H, [])], "Ear_L": [(0, []), (5, [("Z", 25)]), (H, [])],
                        "Ear_R": [(0, []), (5, [("Z", -25)]), (H, [])], "Trunk2": [(0, []), (5, [("X", -20)]), (H, [])],
                        "Spine1": [(0, []), (5, [("Y", 4)]), (H, [])]}, False)
    D = 50
    death = {f"Leg{l}_Upper": [(0, []), (D, [("X", -20 if l[0] == "F" else 20)])] for l in ("FL", "FR", "HL", "HR")}
    death.update({f"Leg{l}_Lower": [(0, []), (D, [("X", 45)])] for l in ("FL", "FR", "HL", "HR")})
    death.update({"Pelvis@loc": [(0, (0, 0, 0)), (D, (0, 0, -0.25))],
                  "Head": [(0, []), (D, [("X", 18)])], "Trunk1": [(0, []), (D, [("X", 15)])], "Trunk2": [(0, []), (D, [("X", 15)])],
                  "Ear_L": [(0, []), (D, [("Z", -10)])], "Ear_R": [(0, []), (D, [("Z", 10)])]})
    clips["Death"] = (D, death, False)
    V = 45
    clips["Victory"] = (V, {"Trunk1": [(0, []), (15, [("X", -60)]), (V, [("X", -55)])], "Trunk2": [(0, []), (15, [("X", -50)]), (V, [("X", -45)])],
                            "Trunk3": [(0, []), (15, [("X", -40)]), (V, [("X", -35)])], "Ear_L": [(0, []), (15, [("Z", 30)]), (V, [("Z", 20)])],
                            "Ear_R": [(0, []), (15, [("Z", -30)]), (V, [("Z", -20)])], "Head": [(0, []), (15, [("X", -10)]), (V, [])]}, False)
    return clips


def kind_of(name):
    return "horse" if name.endswith("Knight") else "elephant" if name.endswith("Rook") else "humanoid"


def author(name):
    sc = bpy.data.scenes[f"PREP_{name}"]
    rig = sc.objects[f"{name}_Rig"]
    if rig.animation_data:
        for t in list(rig.animation_data.nla_tracks):
            rig.animation_data.nla_tracks.remove(t)
    k = kind_of(name)
    clips = humanoid_clips(rig, name.split("_")[1]) if k == "humanoid" else horse_clips(rig) if k == "horse" else elephant_clips(rig)
    out = {}
    for cname, spec in clips.items():
        length, keys = spec[0], spec[1]
        loop = spec[2] if len(spec) > 2 else True
        missing = [b for b in keys if b.split("@")[0] not in rig.pose.bones]
        if missing:
            raise KeyError(f"{name}/{cname}: unknown bones {missing}")
        make_clip(rig, cname, length, keys, loop)
        out[cname] = {"frames": length, "seconds": round(length / FPS, 2), "loop": loop}
    return out


# ------------------------------------------------------------------ render check of a clip
def render_clip(name, clip, frames, out_dir, view="side"):
    """Render selected frames of one clip (NLA solo) for visual verification."""
    sc = bpy.data.scenes[f"PREP_{name}"]; home = bpy.context.window.scene; bpy.context.window.scene = sc
    rig = sc.objects[f"{name}_Rig"]; mesh = sc.objects[name]
    for t in rig.animation_data.nla_tracks:
        t.mute = t.name != clip   # every clip keys every bone, so stacked tracks would override each other
    cam = sc.camera; cam.data.ortho_scale = 2.2
    sc.render.resolution_x = sc.render.resolution_y = 400
    loc = (6, 0, 0.95) if view == "side" else (0, -6, 0.95)
    cam.location = loc; cam.rotation_euler = (Vector((0, 0, 0.95)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    for o in sc.objects:
        if o.type == 'MESH':
            o.hide_render = o is not mesh
    files = []
    for f in frames:
        sc.frame_set(f)
        p = os.path.join(out_dir, f"{name}__{clip}_{f:03d}.png"); sc.render.filepath = p
        bpy.ops.render.render(write_still=True, scene=sc.name); files.append(p)
    for t in rig.animation_data.nla_tracks:
        t.mute = False
    sc.frame_set(0)
    sc.render.resolution_x, sc.render.resolution_y = 480, 640
    bpy.context.window.scene = home
    return files


# ------------------------------------------------------------------ export
PIECE_DIR = {"King": "king", "Queen": "queen", "Bishop": "bishop", "Knight": "knight", "Rook": "rook", "Pawn": "pawn"}


def export_glb(name, repo_root, tex_size=1024, quality=82):
    """Export rig + game mesh + all NLA clips to public/assets/chess-pieces/<army>/<piece>/<NAME>.glb.
    Textures are downsized on temporary copies (the production .blend keeps the 2048 originals)."""
    army, piece = name.split("_")
    sc = bpy.data.scenes[f"PREP_{name}"]; home = bpy.context.window.scene; bpy.context.window.scene = sc
    rig = sc.objects[f"{name}_Rig"]; mesh = sc.objects[name]
    out_dir = os.path.join(repo_root, "public", "assets", "chess-pieces", army.lower(), PIECE_DIR[piece])
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{name}.glb")
    # downsized texture copies swapped in for export only
    mat = mesh.data.materials[0]
    swaps = []
    for n in mat.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image and max(n.image.size) > tex_size:
            small = n.image.copy(); small.name = n.image.name + f"_{tex_size}"
            small.scale(tex_size, tex_size)
            swaps.append((n, n.image)); n.image = small
    # The file holds one scene per character: deselect everything everywhere, export the active scene only.
    for other in bpy.data.scenes:
        for vl in other.view_layers:
            for o in other.objects:
                try:
                    o.select_set(False, view_layer=vl)
                except RuntimeError:
                    pass
    for o in (rig, mesh):
        o.select_set(True)
    bpy.context.view_layer.objects.active = rig
    sc.frame_set(0)
    for pb in rig.pose.bones:
        pb.rotation_quaternion = Quaternion(); pb.location = (0, 0, 0)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, use_active_scene=True,
        export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_frame_step=1,
        export_skins=True, export_all_influences=False, export_def_bones=False,
        export_image_format='WEBP', export_image_quality=quality, export_yup=True, export_apply=False,
        export_morph=False, export_cameras=False, export_lights=False)
    for n, orig in swaps:
        tmp = n.image; n.image = orig; bpy.data.images.remove(tmp)
    bpy.context.window.scene = home
    return {"name": name, "path": path, "bytes": os.path.getsize(path)}
