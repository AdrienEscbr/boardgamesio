import { Segmented } from '@bgio/ui/components/ui.jsx';
import { DECKS, MIN_BETS, ROUNDS, STACKS } from '../engine/game.js';
import { DECK_LABELS, fmt } from './i18n.js';

/** BlackjackIO lobby settings (the platform adds decision time and table size). */
export default function LobbySettings({ settings, disabled, update }) {
  return (
    <>
      <div className="setting">
        <span className="setting__label">Jetons de départ</span>
        <Segmented
          label="Jetons de départ"
          value={settings.stack}
          disabled={disabled}
          onChange={(stack) => update({ stack })}
          options={STACKS.map((v) => ({ value: v, label: fmt(v) }))}
        />
        <span className="hint">Les mêmes pour tous. Le plus gros tapis à la fin gagne.</span>
      </div>
      <div className="setting">
        <span className="setting__label">Manches</span>
        <Segmented
          label="Nombre de manches"
          value={settings.rounds}
          disabled={disabled}
          onChange={(rounds) => update({ rounds })}
          options={ROUNDS.map((v) => ({ value: v, label: String(v) }))}
        />
      </div>
      <div className="setting">
        <span className="setting__label">Mise minimum</span>
        <Segmented
          label="Mise minimum"
          value={settings.minBet}
          disabled={disabled}
          onChange={(minBet) => update({ minBet })}
          options={MIN_BETS.map((v) => ({ value: v, label: fmt(v) }))}
        />
        <span className="hint">Sous la mise minimum, on quitte la table.</span>
      </div>
      <div className="setting">
        <span className="setting__label">Sabot</span>
        <Segmented
          label="Nombre de jeux dans le sabot"
          value={settings.decks}
          disabled={disabled}
          onChange={(decks) => update({ decks })}
          options={DECKS.map((v) => ({ value: v, label: DECK_LABELS[v] }))}
        />
        <span className="hint">{settings.decks === 1 ? 'Un seul jeu : les cartes sorties comptent, pour qui sait les suivre.' : 'Remélangé quand il reste un quart du sabot.'}</span>
      </div>
    </>
  );
}
