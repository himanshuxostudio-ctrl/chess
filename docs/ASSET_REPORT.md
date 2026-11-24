# Ancient Warfare Chess: Phase 1 Asset Selection Report

Source: `/Ancient Warfare Chess/Character Assets/Original GLB Files/` (Dropbox, untouched)
Working copies: `asset-work/source/` (read-only, hashes verified against Dropbox `content_hash`)
Inspected in: Blender 5.3.0 (separate scene `AWC_Audit`; the default scene was left as it was)
Visual check: `sheet_1.png` (King, Queen, Bishop) and `sheet_2.png` (Knight, Rook, Pawn)

## Selected 12 assets

| Army | Piece | Dropbox file | Size | Tris | Verts (welded) | Bounds W×D×H (m) | Kind |
|---|---|---|---|---|---|---|---|
| Sun | King | SUN/SUN_Maharaja_Actual.glb | 16.3 MB | 280,962 | 140,347 | 1.09×0.72×1.90 | Humanoid |
| Sun | Queen | SUN/SUN_Maharani_Queen_Crimson_Sun.glb | 14.1 MB | 191,520 | — | 1.15×1.20×1.90 | Humanoid (sword + shield) |
| Sun | Bishop | SUN/SUN_Rajguru_Bishop_Solar_Sage.glb | 13.8 MB | 191,088 | — | 1.11×0.83×1.90 | Humanoid (staff + book) |
| Sun | Knight | SUN/SUN_ASHVA YODHA.glb | 19.2 MB | 346,842 | 173,365 | 1.50×1.48×1.90 | Horse + rider (fused) |
| Sun | Rook | SUN/SUN_Gajraj_Rook_Golden_Alternative.glb | 19.2 MB | 321,602 | 160,709 | 1.01×1.90×1.82 | Elephant + howdah + mahout (fused) |
| Sun | Pawn | SUN/SUN_Padati_Infantry_Alternative.glb | 14.7 MB | 144,862 | 72,381 | 1.01×0.73×1.90 | Humanoid (spear + shield) |
| Shadow | King | Shadow/SHADOW_Maharaja_King_Crimson_Lion.glb | 19.3 MB | 347,472 | — | 1.11×0.67×1.90 | Humanoid |
| Shadow | Queen | Shadow/SHADOW_Maharani_Queen_Crimson_Lion.glb | 16.6 MB | 220,546 | — | 1.16×1.22×1.90 | Humanoid (sword + shield) |
| Shadow | Bishop | Shadow/SHADOW_Rajguru_Bishop_Solar_Sage.glb | 15.3 MB | 182,522 | — | 1.11×0.80×1.90 | Humanoid (staff + book) |
| Shadow | Knight | Shadow/SHADOW_Ashva_Yoddha_Knight.glb | 25.8 MB | 451,936 | 225,715 | 1.47×1.61×1.90 | Horse + rider (fused) |
| Shadow | Rook | Shadow/SHADOW_Gajraj_Rook_Crimson_Sun.glb | 22.0 MB | 326,242 | 163,015 | 0.94×1.89×1.73 | Elephant + howdah + mahout (fused) |
| Shadow | Pawn | Shadow/SHADOW_Padati_Infantry_Sunfire_Legionnaire.glb | 13.3 MB | 139,382 | — | 1.00×0.55×1.90 | Humanoid (spear + shield) |

All 12: glTF 2.0 (Meshy AI export), 1 mesh / 1 primitive / 1 material / 1 node, 1 UV map, 0 skins, 0 animations.
Textures embedded: base colour (JPEG 2048²), metallic-roughness and normal (2048², PNG or JPEG). All three wired into a Principled BSDF.

## Identity checks (visual)
- Each Sun/Shadow pair is the same character, pose and props. Sun: ivory garments, white horse, gold elephant armour. Shadow: black garments, dark iron, black horse, dark elephant armour. Both share crimson capes.
- No duplicates: 12 distinct files, one per army × piece. None is a white/clay sculpt; all are textured production colour models.
- The filenames are misleading but the folder placement is correct. Several Shadow files have Sun-style names (`…Crimson_Sun`, `…Sunfire_Legionnaire`, `…Solar_Sage`). The renders confirm they are the dark Shadow versions.
- The Dropbox audit doc is stale. It lists 11 files under older names, including `SUN_Maharaja_King_Regal_Lionheart` and `…Golden_Sovereign_Alternative`, which are no longer in the folder, and it does not list `SUN_Maharaja_Actual`.

## Structural findings that affect Phases 3–6
1. **Single fused shells.** After welding UV-seam duplicates, each model is one watertight surface (0 boundary, 0 non-manifold edges). Knights and rooks have just one extra small piece.
   - Knight: the rider cannot be split off as a separate object. A single combined armature (horse chain + rider chain) is the safe approach.
   - Rook: the howdah and mahout ride rigidly on the spine/back bones.
   - Humanoids: capes, sashes, swords, shields and staffs are fused to the body. Weapons need near-rigid weights to the hand bone. Long capes merge into the legs, so they need cape bones and hand-cleaned weights.
2. **Pose.** Humanoids are in a relaxed stance with arms near the body, not a T- or A-pose. The Queen holds the sword out. Automatic weights will bleed between arm and torso, so manual correction is required.
3. **Pivot.** The origin is at the model centre (min Z ≈ −0.95). It must move to the feet before export.
4. **Orientation.** Models face glTF +Z, which already matches the game's model convention.
5. **Scale.** Everything is normalised to 1.9 m tall. Board squares are 1 unit, so a pawn needs about 0.4× scale. Rooks and knights must fit a square footprint (about 0.9 long).
6. **Performance.** A full board at source density is about 6.9 M triangles (16 pawns ≈ 2.3 M), plus 36 textures at 2048². That is not viable, especially on mobile. Planned budget: about 25k tris per humanoid and 40k per knight/rook, decimated from the textured source with normal maps preserved. Textures go to 1024² KTX2/WebP (2048² optional on High quality), with a lower LOD for distant/mobile.

## Missing assets
None. All 12 roles are present.

## How these replace the current procedural units
- `src/three/units/UnitModel.tsx` maps piece → procedural `Humanoid` / `Horse` / `Chariot`. It will load the GLB for (army, piece) from `public/assets/chess-pieces/<army>/<piece>/`, using one cached load per asset with cloned skinned instances.
- `src/three/PieceActor.tsx` keeps the root transform, square mapping, choreography, fade and selection. It will drive an AnimationMixer per instance (idle / walk / attack / hit / die) instead of the procedural `Pose` limb code.
- `ArmyId` (`hellenic` | `persian`) gains `sun` | `shadow`. White = Sun by default; the existing army setting swaps them.
- The procedural units stay as a fallback while models load or if loading fails. Nothing is deleted until the replacement is verified.
- No changes to chess.js, the store, the server or the multiplayer protocol.

---

# Phase 3: Model preparation results

Pipeline: `tools/blender/prep_models.py`, run in Blender 5.3 via MCP. One scene per piece (`PREP_<ARMY>_<Piece>`); the user's open scene was not modified. Each piece is saved as a standalone production `.blend` containing the game mesh and a hidden `_SRC` full-detail copy for later baking.

| Piece | Source tris | Game tris | Verts | Height | Footprint X×Y |
|---|---|---|---|---|---|
| SUN_King | 280,962 | 30,000 | 14,866 | 1.897 | 1.09×0.72 |
| SUN_Queen | 191,520 | 30,000 | 14,986 | 1.899 | 1.15×1.20 |
| SUN_Bishop | 191,088 | 30,000 | 14,984 | 1.899 | 1.11×0.83 |
| SUN_Knight | 346,842 | 40,000 | 19,944 | 1.898 | 1.50×1.48 |
| SUN_Rook | 321,602 | 39,998 | 19,909 | 1.818 | 1.01×1.90 |
| SUN_Pawn | 144,862 | 24,000 | 11,950 | 1.900 | 1.01×0.73 |
| SHADOW_King | 347,472 | 30,000 | 14,828 | 1.897 | 1.11×0.68 |
| SHADOW_Queen | 220,546 | 29,998 | 14,987 | 1.898 | 1.16×1.22 |
| SHADOW_Bishop | 182,522 | 29,998 | 14,989 | 1.900 | 1.11×0.80 |
| SHADOW_Knight | 451,936 | 39,998 | 19,747 | 1.898 | 1.47×1.61 |
| SHADOW_Rook | 326,242 | 40,000 | 19,894 | 1.727 | 0.94×1.89 |
| SHADOW_Pawn | 139,382 | 24,000 | 11,996 | 1.898 | 1.00×0.55 |

- Transforms applied; UV-seam vertices welded (UVs are per-loop, so texturing is unchanged).
- Pivot is on the ground (min Z within ±0.5 mm of 0). Humanoids are centred over their feet; animals over their footprint.
- All face −Y in Blender, which is +Z in glTF and matches the game's model-forward convention.
- Naming: object/mesh `<ARMY>_<Piece>`, material `<ARMY>_<Piece>_MAT`, textures `<ARMY>_<Piece>_{BaseColor,MetalRough,Normal}` (2048², packed).
- A full board drops from ~6.9 M to ~0.94 M triangles.
- Visual check: silhouettes, props, jewellery and textures are preserved at board and close-up scale. Minor faceting around eyes and lips in close-up; fixable by baking a normal map from `_SRC` if needed.
- Textures are still 2048². Downsizing and compression happen at GLB export (Phase 6/9).

---

# Phase 4–5: Humanoid skeletons and rigging (8 of 12 characters)

Pipeline: `tools/blender/rig_humanoid.py` (Blender 5.3 via MCP). Outputs: `<ARMY>_<Piece>_rigged.blend` per character.

## Skeleton (shared structure, fitted per model)
32 bones, Mixamo-style names for retargeting:
- Root, Hips, Spine, Spine1, Spine2, Neck, Head
- Left/Right Shoulder, Arm, ForeArm, Hand
- Left/Right UpLeg, Leg, Foot, ToeBase
- Three cape chains (Cape1–3 centre, CapeL1–3, CapeR1–3) hanging from Spine2

Fingers are omitted: every hand is fused around a weapon, staff, book or shield grip, so finger bones would have nothing to deform.

Sun and Shadow use the same structure, but every model gets its own joint positions. The pairs are separate generations: silhouette overlap is 60–94%, so copying joints between them would misplace them.

## Binding method
1. **Landmarks:** joints read from gridded orthographic renders. Limb depth comes from the mesh surface; hips, knees and shoulders follow rules where robes or shields hide the real surface.
2. **Heat weights:** Blender automatic weights.
3. **Rigid props:** fused weapons and shields locked 100% to one bone by measured regions:
   - spears, sabres and staffs follow their tilt or blade diagonal
   - shields are defined as discs
4. **Weight smoothing:** props are masked out so they stay rigid.
5. **Region separation for fused AI meshes:**
   - each face is labelled by bone family (upper arm, forearm/hand, leg, cape, lower torso, body, prop)
   - seams between incompatible regions are split
   - each vertex keeps only weights compatible with its new region; empty vertices refill from neighbours
   - result: hands no longer fuse to thighs, elbows to capes, cape hems to hips, or scabbards and books to the body
6. **Final weights:** ≤4 influences, normalised.

## Deformation QA
Automated edge-stretch measurement at rest, walk (22°/18° stride), attack (60° arm raise), twist (25° spine, 30° head, cape) and a stress pose. A "visible tear" is an edge stretched more than 1.6× **and** lengthened by more than 1 cm. Every pose was also rendered and checked by eye.

| Character | Verts | Walk | Attack | Twist |
|---|---|---|---|---|
| SUN_Pawn | 12,140 | 0.02%, max 26 mm | 0.14%, max 79 mm | 0.13%, max 33 mm |
| SUN_King | 15,048 | 0.26%, max 80 mm | 0.20%, max 55 mm | 0.28%, max 48 mm |
| SUN_Queen | 15,370 | 0.19%, max 34 mm | 0.04%, max 40 mm | 0.57%, max 57 mm |
| SUN_Bishop | 15,500 | 0.24%, max 53 mm | 0.08%, max 54 mm | 0.22%, max 30 mm |
| SHADOW_Pawn | 12,442 | 0.13%, max 26 mm | 0.11%, max 56 mm | 0.15%, max 35 mm |
| SHADOW_King | 15,123 | 0.30%, max 96 mm | 0.12%, max 65 mm | 0.48%, max 80 mm |
| SHADOW_Queen | 15,334 | 0.15%, max 40 mm | 0.07%, max 41 mm | 0.50%, max 58 mm |
| SHADOW_Bishop | 15,580 | 0.31%, max 50 mm | 0.12%, max 51 mm | 0.17%, max 44 mm |

All characters: 0 unweighted vertices, max 4 influences.

**Known limitations**
- **SHADOW_King:** in the walk, the curved sword lies fused against the trouser front, giving a 96 mm local stretch. It isn't visible in renders.
- **Bishops:** their attack test keeps the book arm still, which matches their staff-strike animation. The book arm is still exercised by the walk and stress poses.
- **Splitting cost:** region splitting adds 0.5–4% vertices along the separation seams.

---

# Phase 4–5: Animal skeletons and rigging (Knight and Rook, both armies)

Pipeline: `tools/blender/rig_quadruped.py`. It reuses the QA and render helpers from `rig_humanoid.py`.

## Preparation fixes found while rigging
- **Knight heading:** both knight models stood about 40–51° off the board axis (the horse was posed at an angle). `prep_models.py` now finds the horse's heading automatically and turns it to face forward: the principal axis of the barrel, with the head end identified by the neck/head mass. Applied: SUN −50.9°, SHADOW −38.5°. The elephants were already aligned.
- **Animal pivots:** now the median of the leg-and-barrel band. The rider's out-thrust sabre had moved the bounding-box centre by about 27 cm.

## Horse + rider (39 bones)
- **Horse:**
  - Root, Pelvis, Spine1, Spine2, Neck1, Neck2, Head
  - Tail1–3
  - 4 legs × 4 bones (Upper, Fore, Cannon, Hoof)
- **Rider:** RiderSpine, Chest, Neck, Head; both arms (Arm, ForeArm, Hand); a two-bone cape. The chain is parented to a **Saddle** bone on Spine1.
- **Attachment:** the rider's seat and legs are fused to the horse, so they are weighted to the horse's back and Saddle. The rider follows every horse movement and cannot slide or detach.
- **Sabre:** rigid to RiderHand_R, along a line fitted to the blade vertices.

## War elephant (30 bones)
- **Body:** Root, Pelvis, Spine1, Neck, Head
- **Trunk:** Trunk1–4
- **Ears:** Ear_L, Ear_R
- **Tail:** Tail1–2
- **Legs:** 4 × 4 bones (Upper, Lower, Foot, Sole)
- **Howdah:** a bone on Spine1 that carries the howdah, mahout, spear and banner rigidly. The tusks are rigid to Head.
- **Trunk weight zone:** head influence fades out of the hanging trunk column below the trunk root, so the trunk swings freely without tearing at the tusk roots.

## Region separation (animal families)
Pairs that are split apart:
- rider (arms, waist) vs horse legs / tail / neck / body
- rider cape vs croup
- tail vs hind legs
- trunk, ears and head vs legs
- leg vs leg
- the caparison "skirt" (body cloth below 0.75 m on the horse, 0.6 m on the elephant) vs legs, so the cloth hangs from the body instead of kicking with the legs

## Deformation QA (game-range poses)

| Character | Verts | Gallop / Walk | Attack | Turn |
|---|---|---|---|---|
| SUN_Knight | 20,665 | 0.17%, max 62 mm | 0.29%, max 92 mm | 0.02%, max 34 mm |
| SHADOW_Knight | 20,163 | 0.10%, max 50 mm | 0.17%, max 60 mm | 0.05%, max 22 mm |
| SUN_Rook | 20,330 | 0.06%, max 23 mm | 0.06%, max 56 mm | 0.01%, max 27 mm |
| SHADOW_Rook | 20,405 | 0.10%, max 25 mm | 0.14%, max 80 mm | 0.03%, max 37 mm |

The test poses:
- **Knight attack:** a rear (pelvis −12°, foreleg −45°, forearm +60°) with the sabre arm raised.
- **Elephant attack:** a trunk swing of about 90° in total, with the ears flared.

All four have 0 unweighted vertices and max 4 influences. **Known:** the SUN_Knight's 92 mm is shoulder-skin stretch at the full rear, a real joint deformation. It isn't visible in renders.

**All 12 characters are now rigged.**

---

# Phase 6: Animation library and GLB export

Pipeline: `tools/blender/animate_export.py` (authoring + export), then `node tools/build_manifest.mjs`.

## Clips (30 fps)

| Skeleton | Clips |
|---|---|
| Humanoid (8) | Idle 2.0 s (loop), Walk 1.0 s (loop), Attack 0.9 s, Hit 0.5 s, Death 1.5 s, Victory 1.5 s, Defend 1.0 s (loop) |
| Horse + rider (2) | Idle 2.0 s, Walk 1.2 s (trot, diagonal pairs), Gallop 0.67 s (transverse), Attack 1.2 s (rear + sabre strike), Hit, Death, Victory |
| Elephant (2) | Idle 3.0 s (ear flap, trunk sway), Walk 1.33 s (lateral sequence), Attack 1.2 s (trunk raise, front stomp), Hit, Death, Victory |

**Attack styles per character:**
- **Pawn:** spear thrust. The forearm counter-rotates so the upright spear comes down level.
- **Queen:** overhead sabre slash.
- **Bishop:** staff raised and struck forward.
- **King:** commanding strike with a raised arm. His sword stays in its scabbard.

**Death:** the knees buckle. Hip translation is computed so the feet stay planted; the game then topples and sinks the unit.

**Authoring conventions:**
- Clips are authored as world-axis rotations and converted into each bone's rest frame, so motions are independent of bone roll.
- Every clip keys every joint, so three.js cross-fades never leave a bone stuck in the previous clip's pose.
- All clips are in place. The game moves the unit's root between squares.

## Export
- One GLB per character, with mesh, skeleton, skin weights (≤4), material, embedded textures and all clips (`export_animation_mode='NLA_TRACKS'`).
- Textures are downsized to 1024² and stored as WebP (quality 82) on temporary copies; the production `.blend` files keep the 2048² originals.
- Only the active scene's rig and game mesh are exported, never the `_SRC` high-poly copy. An early run that exported every scene into each file was caught by the size check (34 MB each) and fixed.
- Location: `public/assets/chess-pieces/<army>/<piece>/<ARMY>_<Piece>.glb`. Total about 24 MB for all 12 (1.6–2.8 MB each), down from 210 MB of source.

## Manifest (`public/assets/chess-pieces/manifest.json`)
Per piece: file, size, skeleton type, joint count, clips (duration and loop flag), source height, footprint, board scale and material name.

Board heights:

| Piece | Squares tall |
|---|---|
| King | 1.00 |
| Knight | 0.95 |
| Queen | 0.92 |
| Bishop | 0.86 |
| Rook | 0.86 |
| Pawn | 0.72 |

The rooks are kept lower so the elephant's length fits in one square.

## Tests (`tests/assets.test.ts`, 73 checks)
- 12 pieces, 6 per army, no duplicates
- size budget
- one skinned mesh and one skin per file
- ≤4 influences, with normalised weights
- full clip set, with every joint animated in every clip
- three WebP textures at ≤1024²
- grounded at y = 0, with the manifest height matching
- footprint fits inside one square

The tests caught the Shadow elephant overlapping the next square (1.009) at the first board height; fixed by lowering rook height.
