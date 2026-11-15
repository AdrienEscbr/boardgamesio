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
  const queen = callable[0]?.endsWith('13');
  return (
    <div className="t-panel">
      <p className="t-panel__title">Appelez {queen ? 'une dame' : 'un roi'} : son détenteur sera votre partenaire secret</p>
      <div className="t-call">
        {callable.map((c) => (
          <button key={c} type="button" className="t-call__card" onClick={() => onCall(c)} disabled={busy} aria-label={`Appeler ${cardLabel(c)}`}>
            <Card card={c} />
            {hand.includes(c) && <span className="t-call__mine">dans votre main</span>}
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
