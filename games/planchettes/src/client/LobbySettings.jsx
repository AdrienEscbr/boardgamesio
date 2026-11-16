import { Segmented } from '@bgio/ui/components/ui.jsx';
import { MODES, ROUNDS } from '../engine/index.js';
import { MODE_SHORT } from './i18n.js';

const MODE_HINTS = {
  tower: 'À votre tour, sortez un bloc de la tour et reposez-le au sommet.',
  build: 'À votre tour, ajoutez une planchette sur la construction commune.',
  free: 'Tout le monde bâtit en même temps, sans tour ni chrono. L’hôte termine la partie quand il veut.',
};

/** PlanchettesIO lobby settings (the platform adds move time and table size). */
export default function LobbySettings({ settings, disabled, update }) {
  return (
    <>
      <div className="setting">
        <span className="setting__label">Jeu</span>
        <Segmented
          label="Jeu"
          value={settings.mode}
          disabled={disabled}
          onChange={(mode) => update({ mode })}
          options={MODES.map((value) => ({ value, label: MODE_SHORT[value] }))}
        />
        <span className="hint">{MODE_HINTS[settings.mode]}</span>
      </div>
      {settings.mode !== 'free' && (
      <div className="setting">
        <span className="setting__label">Manches</span>
        <Segmented
          label="Manches"
          value={settings.rounds}
          disabled={disabled}
          onChange={(rounds) => update({ rounds })}
          options={ROUNDS.map((value) => ({ value, label: String(value) }))}
        />
        <span className="hint">Une manche se termine quand tout s’écroule. Le moins de chutes l’emporte.</span>
      </div>
      )}
    </>
  );
}
