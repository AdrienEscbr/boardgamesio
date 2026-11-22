import { Segmented } from '@bgio/ui/components/ui.jsx';
import { LANG_LABELS, LEVEL_HINTS, LEVEL_LABELS } from './i18n.js';

/** Scrabble-specific lobby settings (the platform adds turn time and player count). */
export default function LobbySettings({ settings, disabled, update }) {
  const level = settings.botLevel ?? 'normal';
  return (
    <>
      <div className="setting">
        <span className="setting__label">Dictionnaire</span>
        <Segmented
          label="Langue du dictionnaire"
          value={settings.lang}
          disabled={disabled}
          onChange={(lang) => update({ lang })}
          options={Object.entries(LANG_LABELS).map(([value, label]) => ({ value, label }))}
        />
      </div>
      <div className="setting">
        <span className="setting__label">Niveau des robots</span>
        <Segmented
          label="Niveau des robots"
          value={level}
          disabled={disabled}
          onChange={(botLevel) => update({ botLevel })}
          options={Object.entries(LEVEL_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <span className="hint">{LEVEL_HINTS[level]}</span>
      </div>
    </>
  );
}
