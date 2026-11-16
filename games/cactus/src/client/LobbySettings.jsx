import { Segmented } from '@bgio/ui/components/ui.jsx';
import { LEVEL_LABELS } from './i18n.js';

/** CactusIO lobby settings (the platform adds decision time and table size). */
export default function LobbySettings({ settings, disabled, update }) {
  return (
    <div className="setting">
      <span className="setting__label">Niveau des robots</span>
      <Segmented
        label="Niveau des robots"
        value={settings.botLevel}
        disabled={disabled}
        onChange={(botLevel) => update({ botLevel })}
        options={Object.entries(LEVEL_LABELS).map(([value, label]) => ({ value, label }))}
      />
      <span className="hint">Plus ils sont forts, mieux ils se souviennent des cartes vues. Zone rouge : 10 points par joueur.</span>
    </div>
  );
}
