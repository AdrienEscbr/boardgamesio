import { useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import Card from './Card.jsx';

let spotTimer = null; // touch: a tapped card lights its player for a moment
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);

/**
 * The trick in the middle of the table. Each card flies in from its player's
 * seat and lands slightly towards it; a finished trick slides to the winner.
 *
 * @param trick   { key, cards: [{ playerId, card }], winnerId? }
 * @param vectors playerId -> { x, y } unit-ish direction from the centre to the seat
 */
export default function TrickArea({ trick, vectors, spread = 0.5, nameOf, onSpotlight }) {
  const reduce = useReducedMotion();
  // Card width follows the CSS (--trick-w); measure it so landing offsets are in pixels.
  const ref = useRef(null);
  const [cardW, setCardW] = useState(80);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setCardW(el.offsetWidth / 2.6));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const d = cardW * spread;
  return (
    <div className="t-trick" aria-live="polite" ref={ref}>
      <AnimatePresence custom={trick?.winnerId}>
        {trick && trick.cards.length > 0 && (
          <motion.div
            key={trick.key}
            className="t-trick__pile"
            custom={trick.winnerId}
            exit="collect"
            variants={{
              collect: (winnerId) => {
                const v = vectors[winnerId] ?? { x: 0, y: 0 };
                return reduce
                  ? { opacity: 0, transition: { duration: 0.2 } }
                  : { x: v.x * 260, y: v.y * 220, scale: 0.35, opacity: 0, transition: { duration: 0.5, ease: [0.55, 0, 0.45, 1] } };
              },
            }}
          >
            {trick.cards.map(({ playerId, card }, i) => {
              const v = vectors[playerId] ?? { x: 0, y: 1 };
              const rot = (hash(card) % 14) - 7;
              const won = trick.winnerId && trick.winnerId === playerId;
              return (
                <motion.div
                  key={card}
                  className={`t-trick__card ${won ? 'is-winner' : ''}`}
                  style={{ zIndex: i + 1 }}
                  title={nameOf?.(playerId)}
                  onPointerEnter={(e) => { if (e.pointerType === 'mouse') onSpotlight?.(playerId); }}
                  onPointerLeave={(e) => { if (e.pointerType === 'mouse') onSpotlight?.(null); }}
                  onClick={() => { onSpotlight?.(playerId); clearTimeout(spotTimer); spotTimer = setTimeout(() => onSpotlight?.(null), 1600); }}
                  initial={reduce ? { opacity: 0 } : { x: v.x * 300, y: v.y * 260, rotate: rot * 3, scale: 0.7, opacity: 0 }}
                  animate={{ x: v.x * d, y: v.y * d * 0.75, rotate: rot, scale: won ? 1.08 : 1, opacity: 1 }}
                  transition={{ type: 'spring', bounce: 0.18, duration: 0.5 }}
                >
                  <Card card={card} />
                  {nameOf && <span className="t-trick__who">{nameOf(playerId)}</span>}
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The chien turning face up, card after card (3D flip). */
export function ChienReveal({ cards, size = 6, faceUp }) {
  return (
    <div className="t-chien" aria-label={faceUp ? 'Le chien' : 'Le chien, face cachée'}>
      {Array.from({ length: size }, (_, i) => (
        <div key={i} className="t-chien__slot" style={{ '--i': i }}>
          <div className={`t-flip ${faceUp && cards?.[i] ? 'is-up' : ''}`}>
            <div className="t-flip__face t-flip__back"><Card faceDown /></div>
            <div className="t-flip__face t-flip__front">{cards?.[i] && <Card card={cards[i]} />}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
