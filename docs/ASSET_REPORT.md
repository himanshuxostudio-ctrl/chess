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
