/**
 * Character mapping: chess piece → ancient army unit.
 *   K  Supreme Commander      Q  Warrior Empress     R  Scythed War Chariot
 *   B  Royal War Priest       N  Elite Cavalry       P  Infantry (4 variants per army)
 */
import { memo, type RefObject } from 'react';
import type { PieceSymbol } from 'chess.js';
import type { ArmyId } from '../../config/settings';
import { armyMaterials } from '../materials';
import { Humanoid, type Outfit } from './Humanoid';
import { Chariot, Horse } from './Mounts';
import type { Pose } from './pose';

const outfitFor = (type: PieceSymbol, army: ArmyId, variant: number): { outfit: Outfit; scale: number } => {
  const hell = army === 'hellenic';
  switch (type) {
    case 'k':
      return {
        scale: 1.42,
        outfit: { helmet: 'kingcrown', weapon: 'greatsword', shield: 'none', cape: true, pauldrons: true, skirt: 'long', beard: true, crest: 3 },
      };
    case 'q':
      return {
        scale: 1.28,
        outfit: { helmet: hell ? 'crown' : 'diadem', weapon: hell ? 'longspear' : 'sword', shield: 'none', cape: true, skirt: 'long', slim: true, pauldrons: true },
      };
    case 'b':
      return {
        scale: 1.2,
        outfit: { helmet: hell ? 'hood' : 'mitre', weapon: 'staff', shield: 'none', robe: true, cape: !hell, beard: true },
      };
    case 'n':
      return { scale: 1, outfit: { helmet: hell ? 'corinthian' : 'tallcap', weapon: 'spear', shield: 'none', seated: true, cape: true, crest: 0 } };
    case 'r':
      return { scale: 0.95, outfit: { helmet: hell ? 'corinthian' : 'tiara', weapon: 'spear', shield: 'none', seated: false, crest: 1 } };
    case 'p':
    default:
      // Infantry variants: spear or sword, different crest colours / headgear, slight size variance.
      return {
        scale: 0.98 + (variant % 3) * 0.025,
        outfit: hell
          ? { helmet: 'corinthian', weapon: variant === 3 ? 'sword' : 'spear', shield: 'aspis', crest: variant, beard: variant === 1 }
          : { helmet: variant % 2 ? 'tiara' : 'tallcap', weapon: variant === 2 ? 'sword' : 'spear', shield: 'wicker', crest: variant, beard: true },
      };
  }
};

interface Props {
  type: PieceSymbol;
  army: ArmyId;
  variant: number;
  pose: RefObject<Pose>;
}

export const UnitModel = memo(function UnitModel({ type, army, variant, pose }: Props) {
  const mats = armyMaterials(army);
  const { outfit, scale } = outfitFor(type, army, variant);
  if (type === 'n')
    return (
      <group scale={1.12}>
        <Horse mats={mats} pose={pose}>
          <group position={[0, -0.02, 0]}>
            <Humanoid mats={mats} army={army} outfit={outfit} pose={pose} scale={0.82} />
          </group>
        </Horse>
      </group>
    );
  if (type === 'r')
    return (
      <group scale={1.08}>
        <Chariot mats={mats} pose={pose}>
          <Humanoid mats={mats} army={army} outfit={{ ...outfit }} pose={pose} scale={0.72} />
        </Chariot>
      </group>
    );
  return <Humanoid mats={mats} army={army} outfit={outfit} pose={pose} scale={scale} />;
});
