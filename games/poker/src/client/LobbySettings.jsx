import { Segmented, Switch } from '@bgio/ui/components/ui.jsx';
import { BLINDS, RISE_EVERY, STACKS } from '../engine/game.js';
import { fmt } from './i18n.js';

/** PokerIO lobby settings (the platform adds decision time and table size). */
export default function LobbySettings({ settings, disabled, update }) {
  return (
    <>
      <div className="setting">
        <span className="setting__label">Tapis de départ</span>
        <Segmented
          label="Tapis de départ"
          value={settings.stack}
          disabled={disabled}
          onChange={(stack) => update({ stack })}
          options={STACKS.map((v) => ({ value: v, label: fmt(v) }))}
        />
        <span className="hint">Le même pour tous. Sans jetons, on est éliminé ; le dernier en lice gagne.</span>
      </div>
      <div className="setting">
        <span className="setting__label">Blindes</span>
        <Segmented
          label="Blindes"
          value={settings.blinds}
          disabled={disabled}
          onChange={(blinds) => update({ blinds })}
          options={BLINDS.map((v) => ({ value: v, label: `${fmt(v / 2)} / ${fmt(v)}` }))}
        />
      </div>
      <div className="setting">
        <Switch
          icon="history"
          label="Blindes croissantes"
          checked={!!settings.rising}
          onChange={(rising) => !disabled && update({ rising })}
        />
        {settings.rising && <span className="hint">Elles doublent toutes les {RISE_EVERY} donnes : la partie ne s’éternise pas.</span>}
      </div>
    </>
  );
}
