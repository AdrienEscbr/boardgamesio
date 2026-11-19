import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
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
 * One hand on the felt: its cards fanned, its total, its bet; once paid, the outcome.
 * `delayOf(i)` gives the deal delay (ms) of card i when it mounts.
 */
export default function Hand({ hand, active = false, settled = false, delayOf = () => 0, showBet = true, label }) {
  const outcome = settled ? hand.outcome : hand.outcome === 'bust' ? 'bust' : null;
  const gain = hand.payout - hand.bet;
  return (
    <div
      className={`bj-hand ${active ? 'is-active' : ''} ${outcome ? `is-${outcome}` : ''} ${hand.doubled ? 'is-doubled' : ''}`}
      aria-label={label}
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
            delay={delayOf(1) + 500}
            className={hand.total > 21 ? 'is-bust' : hand.blackjack ? 'is-bj' : hand.total === 21 ? 'is-21' : ''}
          />
        )}
      </div>
      {showBet && hand.bet > 0 && <ChipStack amount={hand.bet} className="bj-hand__bet" />}
      <AnimatePresence>
        {outcome && (
          <motion.span
            key={outcome}
            className={`bj-outcome bj-outcome--${outcome}`}
            initial={{ scale: 0.4, opacity: 0, y: 6 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', bounce: 0.5, duration: 0.5 }}
          >
            {OUTCOME_LABELS[outcome]}
            {settled && gain !== 0 && <b>{signed(gain)}</b>}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
