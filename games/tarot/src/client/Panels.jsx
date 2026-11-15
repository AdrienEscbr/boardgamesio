import { useState } from 'react';
import { CONTRACT_ORDER, POIGNEE_LEVELS, POIGNEE_THRESHOLDS, EXCUSE, isTrump, sortHand, discardError } from '../engine/index.js';
import { Button } from '@bgio/ui/components/ui.jsx';
import Card from './Card.jsx';
import { CONTRACT_LABELS, CONTRACT_MULT, DISCARD_ERRORS, POIGNEE_LABELS, cardLabel } from './i18n.js';

export function BidPanel({ highestBid, onBid, busy }) {
  const min = highestBid ? CONTRACT_ORDER.indexOf(highestBid) + 1 : 0;
  return (
    <div className="t-panel">
      <p className="t-panel__title">Votre enchère</p>
      <div className="t-bids">
        <Button variant="secondary" onClick={() => onBid('PASS')} disabled={busy}>Passe</Button>
        {CONTRACT_ORDER.map((c, i) => (
          <Button key={c} variant={i < min ? 'ghost' : 'primary'} disabled={busy || i < min} onClick={() => onBid(c)} className="t-bid">
            {CONTRACT_LABELS[c]} <span className="t-bid__mult">×{CONTRACT_MULT[c]}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

export function CallPanel({ callable, hand, onCall, busy }) {
  const figure = { 14: ['un roi', 'roi'], 13: ['une dame', 'dame'], 12: ['un cavalier', 'cavalier'], 11: ['un valet', 'valet'] }[Number(callable[0]?.slice(1))] ?? ['un roi', 'roi'];
  // Calling a card from one's own hand means playing alone: allowed, but never by accident.
  const [armed, setArmed] = useState(null);
  const others = callable.filter((c) => !hand.includes(c));
  const mine = callable.filter((c) => hand.includes(c));
  const pick = (c) => {
    if (mine.includes(c) && armed !== c) { setArmed(c); return; }
    onCall(c);
  };
  return (
    <div className="t-panel">
      <p className="t-panel__title">Appelez {figure[0]} que vous n’avez pas</p>
      <p className={`t-panel__hint ${armed ? 'is-error' : ''}`}>
        {armed
          ? `Vous avez ce ${figure[1]} : vous joueriez seul contre tous. Touchez-le encore pour confirmer.`
          : 'Son détenteur devient votre partenaire secret.'}
      </p>
      <div className="t-call">
        {others.map((c) => (
          <button key={c} type="button" className="t-call__card is-good" onClick={() => pick(c)} disabled={busy} aria-label={`Appeler ${cardLabel(c)}`}>
            <Card card={c} />
          </button>
        ))}
        {mine.length > 0 && <span className="t-call__sep" aria-hidden />}
        {mine.map((c) => (
          <button
            key={c}
            type="button"
            className={`t-call__card is-mine ${armed === c ? 'is-armed' : ''}`}
            onClick={() => pick(c)}
            disabled={busy}
            aria-label={`Appeler ${cardLabel(c)} (dans votre main : vous joueriez seul)`}
          >
            <Card card={c} />
            <span className="t-call__mine">Dans votre main</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function DiscardPanel({ hand, selected, count, chelem, onChelem, onConfirm, busy }) {
  const err = selected.length === count ? discardError(hand, selected, count) : null;
  const msg = err ? (typeof DISCARD_ERRORS[err.code] === 'function' ? DISCARD_ERRORS[err.code](err) : DISCARD_ERRORS[err.code]) : null;
  return (
    <div className="t-panel">
      <p className="t-panel__title">
        Écart : choisissez {count} cartes <span className="t-panel__count tabular">{selected.length}/{count}</span>
      </p>
      <p className={`t-panel__hint ${msg ? 'is-error' : ''}`}>{msg ?? 'Ni roi ni bout ; un atout seulement si vous n’avez pas d’autre choix (il sera montré).'}</p>
      <div className="t-panel__row">
        <label className="t-check">
          <input type="checkbox" checked={chelem} onChange={(e) => onChelem(e.target.checked)} /> Annoncer un chelem
        </label>
        <Button variant="primary" disabled={busy || selected.length !== count || !!err} loading={busy} onClick={onConfirm}>
          Écarter
        </Button>
      </div>
    </div>
  );
}

export function ChelemPanel({ onDecide, busy }) {
  return (
    <div className="t-panel">
      <p className="t-panel__title">Annoncer un chelem ?</p>
      <p className="t-panel__hint">Vous vous engagez à remporter tous les plis : +400 si réussi, −200 sinon.</p>
      <div className="t-panel__row">
        <Button variant="secondary" onClick={() => onDecide(false)} disabled={busy}>Non</Button>
        <Button variant="primary" onClick={() => onDecide(true)} disabled={busy}>Annoncer</Button>
      </div>
    </div>
  );
}

/** Trumps to show for a poignée: the lowest ones, the Excuse only when it is needed. */
export function poigneeCards(hand, n, level) {
  const need = POIGNEE_THRESHOLDS[n][POIGNEE_LEVELS.indexOf(level)];
  const trumps = sortHand(hand.filter(isTrump)).reverse();
  return trumps.length >= need ? trumps.slice(0, need) : [...trumps, EXCUSE];
}

export function PoigneeOffer({ options, n, value, onChange }) {
  return (
    <div className="t-poignee">
      <span>Annoncer avec votre première carte :</span>
      <div className="t-poignee__opts">
        <button type="button" className={`t-chip-btn ${!value ? 'is-on' : ''}`} onClick={() => onChange(null)}>Rien</button>
        {options.map((level) => (
          <button key={level} type="button" className={`t-chip-btn ${value === level ? 'is-on' : ''}`} onClick={() => onChange(level)}>
            {POIGNEE_LABELS[level]} ({POIGNEE_THRESHOLDS[n][POIGNEE_LEVELS.indexOf(level)]} atouts)
          </button>
        ))}
      </div>
    </div>
  );
}
