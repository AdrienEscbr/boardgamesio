import { isBout, sumHalfPoints } from '../engine/index.js';
import { Avatar, Button } from '@bgio/ui/components/ui.jsx';
import Icon from '@bgio/ui/components/Icon.jsx';
import Card from './Card.jsx';
import { DealBreakdown } from './ScoreSheet.jsx';

const pts = (half) => (half % 2 ? `${(half - 1) / 2},5` : String(half / 2));

/**
 * End-of-deal recap shown before the next deal: verdict and scoring, both camps
 * side by side, the chien and the discard, every trick, and who is ready.
 * Everything here is public once the deal is over.
 */
/** Buttons for the sheet footer, so they stay visible however long the summary is. */
export function RoundSummaryActions({ view: v, me, onReady, onStop, canStop, busy }) {
  const waiting = v.players.filter((p) => !v.ready.includes(p.id));
  const iAmReady = v.ready.includes(me);
  return (
    <>
      {canStop && <Button variant="danger" onClick={onStop} disabled={busy}>Terminer la partie</Button>}
      <Button variant="primary" onClick={onReady} disabled={iAmReady || busy}>
        {iAmReady ? `En attente de ${waiting.length} joueur${waiting.length > 1 ? 's' : ''}…` : v.lastDeal ? 'Voir les résultats' : 'Je suis prêt'}
      </Button>
    </>
  );
}

export default function RoundSummary({ view: v, entry, me, nameOf, playersById }) {
  const r = v.result;
  const attackIds = [v.takerId, v.partnerId].filter(Boolean);
  const teamOf = (id) => (attackIds.includes(id) ? 'attack' : 'defense');
  const tricksBy = (team) => v.tricks.filter((t) => teamOf(t.winnerId) === team).length;
  const camps = [
    { team: 'attack', title: 'Attaque', ids: attackIds, half: r.half.attack, bouts: r.bouts, tricks: tricksBy('attack') },
    { team: 'defense', title: 'Défense', ids: v.players.map((p) => p.id).filter((id) => !attackIds.includes(id)), half: r.half.defense, bouts: 3 - r.bouts, tricks: tricksBy('defense') },
  ];
  return (
    <div className="t-summary">
      <DealBreakdown entry={entry} nameOf={nameOf} />

      <section className="t-camps" aria-label="Les deux camps">
        {camps.map((c) => (
          <div key={c.team} className={`t-camp-card team-${c.team} ${c.team === 'attack' ? (r.won ? 'is-winner' : '') : (!r.won ? 'is-winner' : '')}`}>
            <span className="t-camp-card__title">{c.title}</span>
            <span className="t-camp-card__who">{c.ids.map(nameOf).join(', ')}</span>
            <dl className="t-camp-card__stats">
              <div><dt>Points</dt><dd className="tabular">{pts(c.half)}</dd></div>
              <div><dt>Bouts</dt><dd className="tabular">{c.bouts}</dd></div>
              <div><dt>Plis</dt><dd className="tabular">{c.tricks}</dd></div>
            </dl>
          </div>
        ))}
      </section>

      {(v.chien?.length > 0 || v.myDiscard?.length > 0) && (
        <section className="t-summary__row">
          {v.chien?.length > 0 && (
            <div>
              <h4>Le chien</h4>
              <div className="t-mini-cards">{v.chien.map((c) => <span key={c} className={`t-mini ${isBout(c) ? 'is-bout' : ''}`}><Card card={c} /></span>)}</div>
            </div>
          )}
          {v.myDiscard?.length > 0 && (
            <div>
              <h4>L’écart <small>({pts(sumHalfPoints(v.myDiscard))} pts)</small></h4>
              <div className="t-mini-cards">{v.myDiscard.map((c) => <span key={c} className="t-mini"><Card card={c} /></span>)}</div>
            </div>
          )}
        </section>
      )}

      <details className="t-tricks">
        <summary>Voir les {v.tricks.length} plis</summary>
        <ol>
          {v.tricks.map((t, i) => {
            const team = teamOf(t.winnerId);
            const half = sumHalfPoints(t.cards.map((c) => c.card));
            return (
              <li key={i} className={`t-trick-row team-${team}`}>
                <span className="t-trick-row__n tabular">{i + 1}</span>
                <span className="t-trick-row__cards">
                  {t.cards.map(({ playerId, card }) => (
                    <span key={card} className={`t-mini ${playerId === t.winnerId ? 'is-winner' : ''}`} title={nameOf(playerId)}><Card card={card} /></span>
                  ))}
                </span>
                <span className="t-trick-row__who">
                  <strong>{nameOf(t.winnerId)}</strong>
                  <small>{team === 'attack' ? 'Attaque' : 'Défense'} · {pts(half)} pts</small>
                </span>
              </li>
            );
          })}
        </ol>
      </details>

      <section className="t-ready-list" aria-label="Joueurs prêts">
        <ul>
          {v.players.map((p) => {
            const ready = v.ready.includes(p.id);
            const info = playersById[p.id];
            return (
              <li key={p.id} className={ready ? 'is-ready' : ''}>
                {info?.isBot ? <span className="t-mini-avatar"><Icon name="bot" size={14} /></span> : <Avatar name={info?.nickname} index={info?.index ?? 0} size={24} />}
                <span>{nameOf(p.id)}</span>
                {ready ? <Icon name="check" size={14} strokeWidth={3} /> : <span className="t-dots" aria-hidden><i /><i /><i /></span>}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
