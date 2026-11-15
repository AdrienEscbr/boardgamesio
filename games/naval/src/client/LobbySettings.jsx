import { Segmented } from '@bgio/ui/components/ui.jsx';
import { LEVEL_LABELS, MODE_HINTS, MODE_LABELS } from './i18n.js';

/** NavalIO lobby settings (the platform adds turn time and table size). */
export default function LobbySettings({ settings, disabled, update }) {
  return (
    <>
      <div className="setting">
        <span className="setting__label">Règle de tir</span>
        <Segmented
          label="Règle de tir"
          value={settings.mode}
          disabled={disabled}
          onChange={(mode) => update({ mode })}
          options={Object.entries(MODE_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <span className="hint">{MODE_HINTS[settings.mode]}</span>
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
