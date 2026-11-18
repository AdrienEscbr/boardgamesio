import { Segmented } from '@bgio/ui/components/ui.jsx';
import { FORMATS } from '../engine/index.js';
import { FORMAT_LABELS, LEVEL_LABELS, MODE_HINTS, MODE_LABELS } from './i18n.js';

/** MindIO lobby settings (the platform adds the time per guess). */
export default function LobbySettings({ settings, disabled, update }) {
  const f = FORMATS[settings.format] ?? FORMATS.classic;
  const classic = settings.mode === 'classic';
  const t = settings.target;
  return (
    <>
      <div className="setting">
        <span className="setting__label">Mode</span>
        <Segmented
          label="Mode de jeu"
          value={settings.mode}
          disabled={disabled}
          onChange={(mode) => update({ mode })}
          options={Object.entries(MODE_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <span className="hint">{MODE_HINTS[settings.mode]}</span>
      </div>
      <div className="setting">
        <span className="setting__label">Code</span>
        <Segmented
          label="Format du code"
          value={settings.format}
          disabled={disabled}
          onChange={(format) => update({ format })}
          options={Object.entries(FORMAT_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <span className="hint">{f.maxGuesses} essais pour trouver.</span>
      </div>
      <div className="setting">
        <span className="setting__label">Doublons</span>
        <Segmented
          label="Doublons"
          value={settings.duplicates}
          disabled={disabled}
          onChange={(duplicates) => update({ duplicates })}
          options={[{ value: true, label: 'Permis' }, { value: false, label: 'Interdits' }]}
        />
        <span className="hint">{settings.duplicates ? 'Une couleur peut apparaître plusieurs fois dans le code.' : 'Chaque couleur au plus une fois : plus facile.'}</span>
      </div>
      <div className="setting">
        <span className="setting__label">{classic ? 'Manches' : 'Manches gagnantes'}</span>
        <Segmented
          label={classic ? 'Manches comme codeur' : 'Manches gagnantes'}
          value={t}
          disabled={disabled}
          onChange={(target) => update({ target })}
          options={[1, 2, 3].map((v) => ({ value: v, label: classic ? String(v * 2) : String(v) }))}
        />
        <span className="hint">
          {classic ? `${t * 2} manches : chacun est codeur ${t} fois. Le plus de points gagne.` : t === 1 ? 'Une seule manche décide.' : `Le premier à ${t} manches gagne.`}
        </span>
      </div>
      <div className="setting">
        <span className="setting__label">Niveau des robots</span>
        <Segmented
          label="Niveau des robots"
          value={settings.botLevel}
          disabled={disabled}
          onChange={(botLevel) => update({ botLevel })}
          options={Object.entries(LEVEL_LABELS).map(([value, label]) => ({ value, label }))}
        />
      </div>
    </>
  );
}
