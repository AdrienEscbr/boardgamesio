import { Sheet, Avatar } from '@bgio/ui/components/ui.jsx';
import Icon from '@bgio/ui/components/Icon.jsx';
import { CACTUS_LIMIT, cardValue } from '../engine/index.js';
import CactusCard from './CactusCard.jsx';
import { CactusGlyph } from './OrderBar.jsx';
import { cardShort, points, signed, total } from './i18n.js';

const VERDICT = { royal: 'Cactus royal !', success: 'Cactus réussi', failed: 'Cactus raté' };

/**
 * End-of-round recap, laid out like TarotIO's (verdict and scoring, the hands, who is
 * ready, the buttons in the footer) in CactusIO's colours. The ranking shows the red zone.
 */
export default function RoundRecap({ open, onClose, view, nameOf, onReady, busy, finishedAction }) {
  const r = view.roundResult;
  const over = view.phase === 'over';
  const caller = r.cactusBy;
  const humans = view.players.filter((p) => !p.isBot);
  const waiting = humans.filter((p) => !p.ready);
  const me = view.players[view.mySeat];
  const max = Math.max(view.threshold * 1.25, ...view.players.map((p) => p.total));

  const lines = [];
  if (caller) {
    const hand = r.sums[caller] - (r.penalty ? cardValue(r.penalty.card) : 0);
    lines.push([`Cartes de ${nameOf(caller)}`, `${points(hand)} (il en faut ${CACTUS_LIMIT} ou moins)`]);
    if (r.penalty) lines.push([`Carte de pénalité (${cardShort(r.penalty.card)})`, `+${cardValue(r.penalty.card)}, soit ${points(r.sums[caller])}`]);
    lines.push(['Manche', r.outcome === 'royal' ? '−10 (0 point)' : r.outcome === 'success' ? '−5' : `${signed(r.points[caller])} (au-dessus de ${CACTUS_LIMIT})`]);
  }
  lines.push(['Les autres', `ce qui dépasse ${CACTUS_LIMIT} points`]);

  const footer = over ? (
    <>
      <button type="button" className="ct-btn is-ghost" onClick={onClose}><Icon name="eye" size={16} /> Voir la table</button>
      {finishedAction}
    </>
  ) : (
    <>
      <button type="button" className="ct-btn is-ghost" onClick={onClose}><Icon name="eye" size={16} /> Voir la table</button>
      <button type="button" className="ct-btn is-gold" onClick={onReady} disabled={me?.ready || busy}>
        {me?.ready ? `En attente de ${waiting.length} joueur${waiting.length > 1 ? 's' : ''}…` : 'Manche suivante'}
      </button>
    </>
  );

  return (
    <Sheet open={open} onClose={onClose} title={over ? `Dernière manche · ${r.round}` : `Fin de la manche ${r.round}`} size="lg" footer={footer}>
      <div className="ct-recap">
        <div className="ct-recap__break">
          <p className="ct-recap__head">
            {caller ? <><strong>Cactus</strong> de {nameOf(caller)}</> : <>Personne n’a annoncé « Cactus »</>}
          </p>
          {caller && <p className={`ct-recap__verdict is-${r.outcome}`}><CactusGlyph size={18} /> {VERDICT[r.outcome]}</p>}
          <dl className="ct-recap__lines">
            {lines.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="tabular">{v}</dd></div>)}
          </dl>
          <ul className="ct-recap__deltas" aria-label="Classement général">
            {[...view.players].sort((a, b) => a.total - b.total).map((p) => (
              <li key={p.id} className={`${p.id === view.me ? 'is-me' : ''} ${p.red ? 'is-red' : ''}`}>
                <span className="ct-recap__name">{nameOf(p.id)}{p.red && <span className="ct-redtag">zone rouge</span>}</span>
                <strong className={`tabular ${r.points[p.id] < 0 ? 'is-bonus' : r.points[p.id] === 0 ? 'is-zero' : ''}`}>{signed(r.points[p.id])}</strong>
                <span className="ct-recap__total tabular">Total {total(p.total)}</span>
                <span className="ct-gauge" style={{ '--r': Math.max(0, p.total) / max, '--t': view.threshold / max }} aria-hidden><span /><i /></span>
              </li>
            ))}
          </ul>
          <p className="ct-recap__hint">Zone rouge au-delà de {view.threshold} points. {r.last ? 'La partie est terminée.' : 'La partie continue tant que deux joueurs au moins restent en dessous.'}</p>
        </div>

        <section className="ct-recap__hands" aria-label="Les mains">
          {view.players.map((p) => (
            <div key={p.id} className={`ct-hand ${p.id === caller ? `is-caller is-${r.outcome}` : ''} ${r.points[p.id] <= 0 ? 'is-zero' : ''}`}>
              <span className="ct-hand__title">
                {nameOf(p.id)}
                {p.id === caller && <span className="ct-hand__tag"><CactusGlyph size={10} /> Cactus</span>}
              </span>
              <span className="ct-hand__cards">
                {p.slots.some(Boolean)
                  ? p.slots.map((s, k) => s && <CactusCard key={k} card={s.card} faceUp className={r.penalty && p.id === caller && k === r.penalty.slot ? 'is-penalty' : ''} />)
                  : <em>plus aucune carte</em>}
              </span>
              <dl className="ct-hand__stats">
                <div><dt>Cartes</dt><dd className="tabular">{r.sums[p.id]}</dd></div>
                <div><dt>Manche</dt><dd className="tabular">{signed(r.points[p.id])}</dd></div>
                <div><dt>Total</dt><dd className="tabular">{total(p.total)}</dd></div>
              </dl>
            </div>
          ))}
        </section>

        {!over && (
          <section className="ct-recap__ready" aria-label="Joueurs prêts">
            <ul>
              {humans.map((p) => (
                <li key={p.id} className={p.ready ? 'is-ready' : ''}>
                  <Avatar name={p.nickname ?? nameOf(p.id)} index={p.seat} size={24} />
                  <span>{nameOf(p.id)}</span>
                  {p.ready ? <Icon name="check" size={14} strokeWidth={3} /> : <span className="ct-dots" aria-hidden><i /><i /><i /></span>}
                </li>
              ))}
            </ul>
            <span className="ct-recap__hint">La manche suivante commence quand tout le monde est prêt{caller ? `, par ${nameOf(caller)}` : ''}.</span>
          </section>
        )}
      </div>
    </Sheet>
  );
}
