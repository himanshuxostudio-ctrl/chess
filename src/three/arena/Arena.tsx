/**
 * The battlefield around the board, chosen by the match's battlefield id (synced from the server
 * for online games). Shared parts render immediately; each theme's set pieces are lazy-loaded
 * modules so only the arena in use is downloaded. Detail scales with the graphics quality preset.
 *
 * The arena never moves the board: squares are positioned by sqToXZ alone, so a theme can't
 * affect coordinates, rules or move input.
 */
import { lazy, Suspense, useEffect, type ComponentType, type LazyExoticComponent } from 'react';
import { useThree } from '@react-three/fiber';
import { useGame } from '../../game/store';
import { useSettings, type Quality } from '../../config/settings';
import type { BattlefieldId } from '../../../shared/match';
import { arenaTheme, type ArenaTheme } from './themes';
import { sound } from '../../audio/sound';
import { CornerBanners, CornerTorches, Ground, Lights, Mountains, Particles, Sky } from './parts';

type SetProps = { theme: ArenaTheme; quality: Quality };
const SETS: Record<BattlefieldId, LazyExoticComponent<ComponentType<SetProps>>> = {
  sun: lazy(() => import('./sets/SunKingdom')),
  shadow: lazy(() => import('./sets/ShadowKingdom')),
  eclipse: lazy(() => import('./sets/Eclipse')),
  fortress: lazy(() => import('./sets/Fortress')),
};

/** Per-theme renderer settings: exposure and image-based-lighting strength. */
function Exposure({ theme }: { theme: ArenaTheme }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    gl.toneMappingExposure = theme.light.exposure;
    scene.environmentIntensity = theme.light.envIntensity;
    sound.setAmbience(theme.ambience);
  }, [gl, scene, theme]);
  return null;
}

export function Arena() {
  const battlefield = useGame((s) => s.battlefield);
  const quality = useSettings((s) => s.quality);
  const theme = arenaTheme(battlefield);
  const Set = SETS[theme.id];
  const particleCount = Math.round((quality === 'low' ? 120 : quality === 'high' ? 600 : 300) * theme.particles.density);
  return (
    <group key={theme.id}>
      <Exposure theme={theme} />
      <Sky theme={theme} />
      <Lights theme={theme} quality={quality} />
      <Ground theme={theme} />
      <CornerTorches theme={theme} quality={quality} />
      <CornerBanners theme={theme} />
      <Mountains color={theme.mountains} jagged={theme.id === 'shadow'} />
      <Particles kind={theme.particles.kind} color={theme.particles.color} count={particleCount} />
      <Suspense fallback={null}>
        <Set theme={theme} quality={quality} />
      </Suspense>
    </group>
  );
}
