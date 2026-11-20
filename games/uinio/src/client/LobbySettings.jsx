import { Segmented, Switch } from '@bgio/ui/components/ui.jsx';
import { TARGETS } from '../engine/game.js';
import { LEVEL_LABELS, TARGET_LABELS } from './i18n.js';

/** UINIO lobby settings (the platform adds the turn time and the table size). */
export default function LobbySettings({ settings, disabled, update }) {
  const toggle = (field) => (on) => !disabled && update({ [field]: on });
  return (
    <>
      <div className="setting">
        <span className="setting__label">Objectif</span>
        <Segmented
          label="Points à atteindre"
          value={settings.target}
          disabled={disabled}
          onChange={(target) => update({ target })}
          options={TARGETS.map((v) => ({ value: v, label: TARGET_LABELS[v] }))}
        />
        <span className="hint">Le gagnant d’une manche marque les cartes restées chez les autres. {settings.target === 150 ? 'Une partie courte.' : settings.target === 500 ? 'Une longue soirée.' : 'Quelques manches.'}</span>
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
        <span className="hint">{settings.botLevel === 'easy' ? 'Ils oublient parfois d’annoncer.' : settings.botLevel === 'hard' ? 'Ils repèrent les couleurs qui vous manquent.' : 'Ils jouent juste et contrent les oublis.'}</span>
      </div>
      <div className="setting">
        <Switch icon="cards" label="Cumul des +2 et +4" checked={!!settings.stacking} onChange={toggle('stacking')} disabled={disabled} />
        <span className="hint">{settings.stacking ? 'On répond à un +2 par un +2, à un +4 par un +4 : le premier qui ne peut pas pioche le total.' : 'Un +2 ou un +4 fait piocher le suivant aussitôt.'}</span>
      </div>
      <div className="setting">
        <Switch icon="cards" label="Doublons" checked={!!settings.doubles} onChange={toggle('doubles')} disabled={disabled} />
        <span className="hint">{settings.doubles ? 'Après un chiffre, le même chiffre dans d’autres couleurs peut suivre dans le même tour.' : 'Une carte par tour.'}</span>
      </div>
      <div className="setting">
        <Switch icon="cards" label="Piocher jusqu’à pouvoir jouer" checked={!!settings.drawUntil} onChange={toggle('drawUntil')} disabled={disabled} />
        <span className="hint">{settings.drawUntil ? 'On pioche jusqu’à tomber sur une carte jouable.' : 'On pioche une seule carte.'}</span>
      </div>
    </>
  );
}
