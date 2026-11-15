import { Segmented } from '@bgio/ui/components/ui.jsx';
import { dimensions } from '../engine/index.js';
import { LEVEL_LABELS, SIZE_LABELS } from './i18n.js';

/** P4IO lobby settings (the platform adds move time and table size). */
export default function LobbySettings({ settings, disabled, update }) {
  const two = dimensions(2, settings.size);
  const three = dimensions(3, settings.size);
  return (
    <>
      <div className="setting">
        <span className="setting__label">Manches gagnantes</span>
        <Segmented
          label="Manches gagnantes"
          value={settings.target}
          disabled={disabled}
          onChange={(target) => update({ target })}
          options={[1, 3, 5].map((v) => ({ value: v, label: String(v) }))}
        />
        <span className="hint">{settings.target === 1 ? 'Une seule manche décide.' : `Le premier à ${settings.target} manches gagne ; celui qui commence change à chaque manche.`}</span>
      </div>
      <div className="setting">
        <span className="setting__label">Plateau</span>
        <Segmented
          label="Plateau"
          value={settings.size}
          disabled={disabled}
          onChange={(size) => update({ size })}
          options={Object.entries(SIZE_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <span className="hint">{two.cols} × {two.rows} à 2 joueurs, {three.cols} × {three.rows} à 3.</span>
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
