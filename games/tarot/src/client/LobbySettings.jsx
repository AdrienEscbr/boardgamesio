import { Segmented, Switch } from '@bgio/ui/components/ui.jsx';

const DONNES = [
  { value: 5, label: '5' },
  { value: 10, label: '10' },
  { value: 15, label: '15' },
  { value: 0, label: 'Libre' },
];

/** TarotIO lobby settings (the platform adds decision time and table size). */
export default function LobbySettings({ settings, disabled, update }) {
  return (
    <>
      <div className="setting">
        <span className="setting__label">Nombre de donnes</span>
        <Segmented label="Nombre de donnes" value={settings.donnes} disabled={disabled} onChange={(donnes) => update({ donnes })} options={DONNES} />
        {settings.donnes === 0 && <span className="hint">L’hôte arrête la partie quand il le souhaite.</span>}
      </div>
      <div className="setting">
        <Switch
          icon="cards"
          label="Aide au comptage des points"
          checked={!!settings.countingAid}
          onChange={(countingAid) => !disabled && update({ countingAid })}
        />
      </div>
    </>
  );
}
