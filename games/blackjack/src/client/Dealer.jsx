import { AnimatePresence, motion } from 'motion/react';
import Card, { CardBack } from './Card.jsx';
import { TotalBadge, totalLabel } from './Hand.jsx';

/**
 * The pile of cards, top right of the felt: cards fly out of its top card. Its thickness
 * (the card edges under the top card) shows what is left in the shoe.
 */
export function Shoe({ left, size }) {
  const share = size ? left / size : 1;
  const depth = Math.max(1, Math.round(share * 6));
  return (
    <div className="bj-shoe" aria-label={`Sabot : ${left} cartes`} style={{ '--depth': depth }}>
      {Array.from({ length: depth }, (_, i) => <span key={i} className="bj-shoe__edge" style={{ '--k': depth - i }} />)}
      <span id="bj-shoe" className="bj-shoe__top"><CardBack /></span>
      <span className="bj-shoe__count">{left}</span>
    </div>
  );
}

/** The dealer's cards (the hole card face down until it turns over) and the total. */
export default function Dealer({ dealer, delayOf = () => 0, verdict, thinking = false }) {
  const shown = dealer.cards.filter((c) => c != null).length > 0;
  return (
    <div className={`bj-dealer ${dealer.total > 21 ? 'is-bust' : ''} ${dealer.blackjack ? 'is-bj' : ''}`} aria-label="La banque">
      <div className="bj-dealer__cards">
        {dealer.cards.map((c, i) => (
          // The hole card keeps its slot (key) when it turns over.
          <span key={i === 1 ? 'hole' : c} className="bj-hand__slot" style={{ '--i': i }}>
            <Card card={c} faceUp={c != null} from="bj-shoe" delay={delayOf(i)} />
          </span>
        ))}
        {!dealer.cards.length && <span className="bj-dealer__empty" />}
        {shown && (
          <TotalBadge
            key={dealer.cards.length ? 'total' : 'none'}
            text={dealer.blackjack ? 'BJ' : dealer.revealed ? totalLabel(dealer) : String(dealer.total)}
            delay={delayOf(0) + 500}
            className={`bj-total--dealer ${dealer.total > 21 ? 'is-bust' : dealer.blackjack ? 'is-bj' : ''}`}
          />
        )}
      </div>
      <AnimatePresence mode="wait">
        {(verdict || thinking) && (
          <motion.span
            key={verdict ?? 'thinking'}
            className={`bj-dealer__verdict ${thinking && !verdict ? 'is-thinking' : ''}`}
            initial={{ y: -6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
          >
            {verdict ?? 'La banque joue…'}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
