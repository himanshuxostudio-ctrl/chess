/** Main "start a battle" screen: six ways into a match, each backed by a real flow. */
import { ModeGlyph } from '../ui/components/Icons';
import { describeTime, battlefieldName } from '../../shared/match';
import { useMatchPrefs } from './prefs';
import { useProfile } from '../profile/profile';

export type HubAction = 'quick' | 'friend' | 'link' | 'ai' | 'custom' | 'local' | 'watch';

export function MatchHub({ onPick }: { onPick: (a: HubAction) => void }) {
  const prefs = useMatchPrefs();
  const rating = useProfile((p) => p.rating);
  const clock = describeTime(prefs.timeControl);
  const field = prefs.battlefield === 'random' ? 'Random battlefield' : battlefieldName(prefs.battlefield);
  const cards: { id: HubAction; title: string; text: string; tag: string; G: (p: { className?: string }) => React.ReactElement; primary?: boolean }[] = [
    { id: 'quick', title: 'Quick Match', text: 'Be paired with another commander who wants the same clock.', tag: `Online · ${clock}`, G: ModeGlyph.friend, primary: true },
    { id: 'friend', title: 'Play a Friend', text: 'Set up a private battle, then send your friend the invitation.', tag: 'Private · choose every setting', G: ModeGlyph.friend },
    { id: 'link', title: 'Create Challenge Link', text: 'Make an invitation straight away with your saved settings.', tag: `${clock} · ${field}`, G: ModeGlyph.spectate },
    { id: 'ai', title: 'Play Against AI', text: 'Face the Stockfish engine at one of six skill levels.', tag: 'Single player · offline-ready', G: ModeGlyph.ai },
    { id: 'custom', title: 'Custom Match', text: 'Choose the opponent, army, clock, battlefield and match rules.', tag: 'All options', G: ModeGlyph.ai },
    { id: 'local', title: 'Local Two-Player', text: 'Two commanders share one device. No internet connection needed.', tag: 'Same device', G: ModeGlyph.local },
  ];
  return (
    <>
      <div className="hub-head">
        <div>
          <h2 style={{ fontSize: 30, margin: '0 0 4px' }}>Prepare for Battle</h2>
          <p className="muted" style={{ margin: 0 }}>Every battle uses the full official rules of chess.</p>
        </div>
        <span className="rating-pill">Rating {rating}</span>
      </div>
      <div className="hub-grid">
        {cards.map(({ id, title, text, tag, G, primary }) => (
          <button key={id} className={`mode-card hub-card ${primary ? 'primary' : ''}`} onClick={() => onPick(id)}>
            <G className="glyph" />
            <h3>{title}</h3>
            <p>{text}</p>
            <span className="tag">{tag}</span>
          </button>
        ))}
      </div>
      <button className="btn ghost small" style={{ marginTop: 14 }} onClick={() => onPick('watch')}>
        Watch a live battle as a spectator
      </button>
    </>
  );
}
