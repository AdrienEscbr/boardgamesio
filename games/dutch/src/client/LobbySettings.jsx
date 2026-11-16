import { Segmented, Switch } from '@bgio/ui/components/ui.jsx';
import { TARGETS } from '../engine/index.js';
import { LEVEL_LABELS } from './i18n.js';

/** DutchIO lobby settings (the platform adds decision time and table size). */
export default function LobbySettings({ settings, disabled, update }) {
  return (
    <>
      <div className="setting">
        <span className="setting__label">Fin de partie</span>
        <Segmented
          label="Fin de partie"
          value={settings.target}
          disabled={disabled}
          onChange={(target) => update({ target })}
          options={TARGETS.map((t) => ({ value: t, label: `${t} pts` }))}
        />
        <span className="hint">La partie s’arrête quand quelqu’un atteint {settings.target} points ; le plus petit total gagne.</span>
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
        <span className="hint">Plus ils sont forts, mieux ils se souviennent des cartes vues.</span>
      </div>
      <div className="setting">
        <Switch
          icon="cards"
          label="Brûler les cartes des autres"
          checked={!!settings.burnOthers}
          onChange={(burnOthers) => !disabled && update({ burnOthers })}
        />
        <span className="hint">{settings.burnOthers ? 'Vous pouvez aussi brûler une carte adverse de même valeur, en lui donnant une des vôtres.' : 'On ne brûle que ses propres cartes.'}</span>
      </div>
    </>
  );
}
