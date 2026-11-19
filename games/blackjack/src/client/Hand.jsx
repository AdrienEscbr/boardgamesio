import { useState } from 'react';
import Card from './Card.jsx';
import { ChipStack } from './Chip.jsx';
import { OUTCOME_LABELS, signed } from './i18n.js';

/** The total as players say it: "7 / 17" while an ace can still count 11. */
export function totalLabel({ total, soft, cards }) {
  if (!cards?.length) return '';
  if (soft && total < 21 && cards.length > 1) return `${total - 10} / ${total}`;
  return String(total);
}

/** The total in a round badge: pops in once the cards are down, ticks when it changes. */
export function TotalBadge({ text, delay = 0, className = '' }) {
  const [wait] = useState(delay);
  return (
    <span className={`bj-total ${className}`} style={{ animationDelay: `${wait}ms` }}>
      <span key={text} className="bj-total__value">{text}</span>
    </span>
  );
}

/**
 * A blackjack celebrated on the felt: a gold glow and rays burst behind the cards and
 * "Blackjack" pops over them, once the cards have turned over (CSS animations).
 */
export function Burst({ delay = 0 }) {
  const [wait] = useState(delay);
  return (
    <span className="bj-burst" style={{ '--d': `${wait}ms` }} aria-hidden>
      <span className="bj-burst__glow" />
      <span className="bj-burst__rays" />
      {Array.from({ length: 8 }, (_, i) => <i key={i} className="bj-burst__spark" style={{ '--a': `${i * 45 + 20}deg` }} />)}
      <span className="bj-burst__word">Blackjack</span>
    </span>
  );
}

/** Over 21: a red rubber stamp slams onto the cards. */
export function Stamp({ text = 'Sauté', delay = 0 }) {
  const [wait] = useState(delay);
  return <span className="bj-stamp" style={{ '--d': `${wait}ms` }} aria-hidden>{text}</span>;
}

/**
 * One hand on the felt: its cards fanned, its total, its bet; once paid, the outcome.
 * `delayOf(i)` gives the deal delay (ms) of card i when it mounts.
 */
export default function Hand({ hand, active = false, settled = false, delayOf = () => 0, showBet = true, label, betId, revealMs = 0 }) {
  const outcome = settled ? hand.outcome : null;
  const busted = hand.total > 21;
  const gain = hand.payout - hand.bet;
  return (
    <div
      className={`bj-hand ${active ? 'is-active' : ''} ${outcome ? `is-${outcome}` : ''} ${busted ? 'is-busted' : ''} ${hand.doubled ? 'is-doubled' : ''}`}
      aria-label={label}
      style={{ '--reveal': `${revealMs}ms` }}
    >
      <div className="bj-hand__cards">
        {hand.cards.map((c, i) => (
          <span key={c} className="bj-hand__slot" style={{ '--i': i }}>
            <Card card={c} from="bj-shoe" delay={delayOf(i)} className={hand.doubled && i === 2 ? 'is-sideways' : ''} />
          </span>
        ))}
        {hand.cards.length > 0 && (
          <TotalBadge
            text={hand.blackjack ? 'BJ' : totalLabel(hand)}
            delay={delayOf(1) + 800}
            className={hand.total > 21 ? 'is-bust' : hand.blackjack ? 'is-bj' : hand.total === 21 ? 'is-21' : ''}
          />
        )}
        {hand.blackjack && <Burst delay={delayOf(1) + 850} />}
        {busted && <Stamp delay={delayOf(hand.cards.length - 1) + 650} />}
        {/* Paid: a gilded label over the bottom of the cards (a busted hand keeps its stamp). */}
        {outcome && outcome !== 'bust' && (
          <span key={`${outcome}-${gain}`} className={`bj-result bj-result--${outcome}`} style={{ '--d': `${revealMs}ms` }}>
            <span className="bj-result__word">{OUTCOME_LABELS[outcome]}</span>
            {gain !== 0 && <b>{signed(gain)}</b>}
          </span>
        )}
      </div>
      {showBet && hand.bet > 0 && <ChipStack amount={hand.bet} className="bj-hand__bet" vertical layoutId={betId} />}
    </div>
  );
}
