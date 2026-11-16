import { Sheet, Avatar } from '@bgio/ui/components/ui.jsx';
import Icon from '@bgio/ui/components/Icon.jsx';
import { DUTCH_LIMIT, FAILED_DUTCH_PENALTY } from '../engine/index.js';
import DutchCard from './DutchCard.jsx';
import { points } from './i18n.js';

/**
 * End-of-round recap, laid out like TarotIO's (verdict and scoring, the hands, who is
 * ready, the buttons in the footer) in DutchIO's colours.
 */
export default function RoundRecap({ open, onClose, view, nameOf, onReady, busy, finishedAction }) {
  const r = view.roundResult;
  const over = view.phase === 'over';
  const caller = r.dutchBy;
  const others = view.players.filter((p) => p.id !== caller);
  const best = Math.min(...others.map((p) => r.sums[p.id]));
  const humans = view.players.filter((p) => !p.isBot);
  const waiting = humans.filter((p) => !p.ready);
  const me = view.players[view.mySeat];

  const lines = [];
  if (caller) {
    lines.push([`Cartes de ${nameOf(caller)}`, `${points(r.sums[caller])} (il en faut ${DUTCH_LIMIT} ou moins)`]);
    lines.push(['Plus petit total des autres', points(best)]);
    if (!r.success) lines.push(['Pénalité', `+${FAILED_DUTCH_PENALTY}`]);
  } else {
    lines.push(['Plus petit total', points(best)]);
  }
  const verdict = !caller ? 'La pioche est vide' : r.success ? 'Dutch réussi' : 'Dutch raté';

  const footer = over ? (
    <>
      <button type="button" className="dt-btn is-ghost" onClick={onClose}><Icon name="eye" size={16} /> Voir la table</button>
      {finishedAction}
    </>
  ) : (
    <>
      <button type="button" className="dt-btn is-ghost" onClick={onClose}><Icon name="eye" size={16} /> Voir la table</button>
      <button type="button" className="dt-btn is-gold" onClick={onReady} disabled={me?.ready || busy}>
        {me?.ready ? `En attente de ${waiting.length} joueur${waiting.length > 1 ? 's' : ''}…` : 'Manche suivante'}
      </button>
    </>
  );

  return (
    <Sheet open={open} onClose={onClose} title={over ? `Dernière manche · ${r.round}` : `Fin de la manche ${r.round}`} size="lg" footer={footer}>
      <div className="dt-recap">
        <div className="dt-recap__break">
          <p className="dt-recap__head">
            {caller ? <><strong>Dutch</strong> de {nameOf(caller)}</> : <>Personne n’a annoncé « Dutch »</>}
          </p>
          <p className={`dt-recap__verdict ${caller && !r.success ? 'is-lost' : 'is-won'}`}>{verdict}</p>
          <dl className="dt-recap__lines">
            {lines.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="tabular">{v}</dd></div>)}
          </dl>
          <ul className="dt-recap__deltas">
            {[...view.players].sort((a, b) => r.points[a.id] - r.points[b.id]).map((p) => (
              <li key={p.id} className={p.id === view.me ? 'is-me' : ''}>
                <span className="dt-recap__name">{nameOf(p.id)}</span>
                <strong className={`tabular ${r.points[p.id] === 0 ? 'is-zero' : ''}`}>{r.points[p.id] === 0 ? '0' : `+${r.points[p.id]}`}</strong>
                <span className="dt-recap__total tabular">Total {p.total}</span>
                <span className="dt-recap__bar" style={{ '--r': Math.min(1, p.total / view.target), '--hue': Math.round(140 - 140 * Math.min(1, p.total / view.target)) }}><span /></span>
              </li>
            ))}
          </ul>
        </div>

        <section className="dt-recap__hands" aria-label="Les mains">
          {view.players.map((p) => (
            <div key={p.id} className={`dt-hand ${p.id === caller ? (r.success ? 'is-caller' : 'is-caller is-failed') : ''} ${r.points[p.id] === 0 ? 'is-zero' : ''}`}>
              <span className="dt-hand__title">
                {nameOf(p.id)}
                {p.id === caller && <span className="dt-hand__tag"><Icon name="lock" size={10} strokeWidth={2.8} /> Dutch</span>}
              </span>
              <span className="dt-hand__cards">
                {p.slots.some(Boolean) ? p.slots.filter(Boolean).map((s, k) => <DutchCard key={k} card={s.card} faceUp />) : <em>plus aucune carte</em>}
              </span>
              <dl className="dt-hand__stats">
                <div><dt>Cartes</dt><dd className="tabular">{r.sums[p.id]}</dd></div>
                <div><dt>Manche</dt><dd className="tabular">+{r.points[p.id]}</dd></div>
                <div><dt>Total</dt><dd className="tabular">{p.total}</dd></div>
              </dl>
            </div>
          ))}
        </section>

        {!over && (
          <section className="dt-recap__ready" aria-label="Joueurs prêts">
            <ul>
              {humans.map((p) => (
                <li key={p.id} className={p.ready ? 'is-ready' : ''}>
                  <Avatar name={p.nickname ?? nameOf(p.id)} index={p.seat} size={24} />
                  <span>{nameOf(p.id)}</span>
                  {p.ready ? <Icon name="check" size={14} strokeWidth={3} /> : <span className="dt-dots" aria-hidden><i /><i /><i /></span>}
                </li>
              ))}
            </ul>
            <span className="dt-recap__hint">La manche suivante commence quand tout le monde est prêt.</span>
          </section>
        )}
      </div>
    </Sheet>
  );
}
