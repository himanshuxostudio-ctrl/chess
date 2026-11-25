import { useSettings, type Quality } from '../../config/settings';
import { sound } from '../../audio/sound';
import { useGame } from '../../game/store';

const Toggle = ({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) => (
  <label className="toggle">
    <span>
      {label}
      {hint && <div className="muted" style={{ fontSize: 12 }}>{hint}</div>}
    </span>
    <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
  </label>
);

const Slider = ({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt?: (v: number) => string }) => (
  <label style={{ display: 'grid', gap: 4, padding: '6px 0' }}>
    <span style={{ display: 'flex', justifyContent: 'space-between' }}>
      {label} <span className="muted">{fmt ? fmt(value) : `${Math.round(value * 100)}%`}</span>
    </span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
  </label>
);

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  const thinkMultiplier = useGame((g) => g.thinkMultiplier);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Settings">
        <h2>War Council Settings</h2>
        <div className="ornament" />
        <div className="settings-section">
          <div className="label">Graphics</div>
          <div className="choice-row" style={{ marginTop: 8 }}>
            {(['low', 'medium', 'high'] as Quality[]).map((q) => (
              <button key={q} className={`chip ${s.quality === q ? 'on' : ''}`} onClick={() => s.set({ quality: q })}>
                {q[0].toUpperCase() + q.slice(1)}
              </button>
            ))}
          </div>
          <Toggle label="Combat animations" hint="Cinematic duels on every capture" value={s.combatAnimations} onChange={(v) => s.set({ combatAnimations: v })} />
          <Toggle label="Cinematic camera" hint="Camera follows captures and checks" value={s.cinematicCamera} onChange={(v) => s.set({ cinematicCamera: v })} />
          <Toggle label="Fixed camera" hint="Disable orbit / zoom / pan" value={s.fixedCamera} onChange={(v) => s.set({ fixedCamera: v })} />
          <Toggle label="Show move hints" value={s.showHints} onChange={(v) => s.set({ showHints: v })} />
          <Toggle label="Confirm before resigning" value={s.confirmResign} onChange={(v) => s.set({ confirmResign: v })} />
          <Toggle label="Rotate board to side to move (pass & play)" value={s.autoRotateBoard} onChange={(v) => s.set({ autoRotateBoard: v })} />
          <Slider label="Animation speed" value={s.animationSpeed} min={0.5} max={2.5} step={0.1} onChange={(v) => s.set({ animationSpeed: v })} fmt={(v) => `${v.toFixed(1)}×`} />
          <Slider label="Camera sensitivity" value={s.cameraSensitivity} min={0.3} max={2} step={0.1} onChange={(v) => s.set({ cameraSensitivity: v })} fmt={(v) => `${v.toFixed(1)}×`} />
          <Slider label="AI thinking time" value={thinkMultiplier} min={0.5} max={3} step={0.25} onChange={(v) => useGame.setState({ thinkMultiplier: v })} fmt={(v) => `${v.toFixed(2)}×`} />
        </div>
        <div className="settings-section">
          <p className="muted" style={{ fontSize: 12, margin: '0 0 6px' }}>The Sun Army always commands White and moves first, so every player and spectator sees the same armies. Pick your army when you set up a match.</p>
          <div className="label">Character models</div>
          <div className="choice-row" style={{ marginTop: 8 }}>
            <button className={`chip ${s.unitModels === 'detailed' ? 'on' : ''}`} onClick={() => s.set({ unitModels: 'detailed' })}>
              Detailed armies
            </button>
            <button className={`chip ${s.unitModels === 'classic' ? 'on' : ''}`} onClick={() => s.set({ unitModels: 'classic' })}>
              Classic (lightweight)
            </button>
          </div>
        </div>
        <div className="settings-section">
          <div className="label">Sound</div>
          <Toggle
            label="Sound enabled"
            value={s.soundOn}
            onChange={(v) => {
              s.set({ soundOn: v });
              if (v) {
                sound.unlock();
                sound.startAmbient();
              }
            }}
          />
          <Slider label="Master" value={s.volumes.master} min={0} max={1} step={0.05} onChange={(v) => s.setVolume('master', v)} />
          <Slider label="Music & drums" value={s.volumes.music} min={0} max={1} step={0.05} onChange={(v) => s.setVolume('music', v)} />
          <Slider label="Environment (wind)" value={s.volumes.environment} min={0} max={1} step={0.05} onChange={(v) => s.setVolume('environment', v)} />
          <Slider label="Combat effects" value={s.volumes.combat} min={0} max={1} step={0.05} onChange={(v) => s.setVolume('combat', v)} />
          <Slider label="Interface" value={s.volumes.ui} min={0} max={1} step={0.05} onChange={(v) => s.setVolume('ui', v)} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
