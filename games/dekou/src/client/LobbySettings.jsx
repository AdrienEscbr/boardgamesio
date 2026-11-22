import { Segmented } from '@bgio/ui/components/ui.jsx';
import { BOT_LEVELS } from '../engine/game.js';
import { LEVEL_LABELS } from './i18n.js';

const LEVEL_HINTS = {
  easy: 'Une main qui tremble : un lancer sur trois rate sa cible.',
  normal: 'Une main sûre, et l’œil pour ne pas vous laisser une unité à rapatrier.',
  hard: 'Presque infaillible, et ne frappe que quand ça ne vous profite pas.',
};

/** DekouIO lobby settings (the platform adds the turn time; the table is always for two). */
export default function LobbySettings({ settings, disabled, update }) {
  return (
    <div className="setting">
      <span className="setting__label">Niveau des robots</span>
      <Segmented
        label="Niveau des robots"
        value={settings.botLevel}
        disabled={disabled}
        onChange={(botLevel) => update({ botLevel })}
        options={BOT_LEVELS.map((value) => ({ value, label: LEVEL_LABELS[value] }))}
      />
      <span className="hint">{LEVEL_HINTS[settings.botLevel] ?? LEVEL_HINTS.normal}</span>
    </div>
  );
}
