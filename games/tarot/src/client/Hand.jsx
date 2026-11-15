import { useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { isTrump, EXCUSE } from '../engine/index.js';
import Card from './Card.jsx';

/**
 * The player's hand as a fan. Lays itself out from the available width; above
 * ~18 cards on a narrow screen it splits into two rows (trumps behind, suits in front).
 *
 * mode 'play'    : `playable` cards are lit, others dimmed; onPlay(card) / onRefuse(card)
 * mode 'discard' : cards toggle in and out of `selected`; `locked` cannot be chosen
 * mode 'view'    : no interaction
 */
export default function Hand({ cards, mode = 'view', playable = [], selected = [], fresh = [], locked = [], onPlay, onRefuse, onToggle, finePointer }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(360);
  const [armed, setArmed] = useState(null); // touch: first tap arms a card, second tap plays it
  const drag = useRef(null);
  const flicked = useRef(false); // the click that follows a flick must not play twice

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Large screens: grow with the window, but keep the hand within ~22% of its height.
  const viewH = typeof window !== 'undefined' ? window.innerHeight : 800;
  const cardW = width >= 900 ? Math.round(Math.min(132, Math.max(96, viewH * 0.12))) : width >= 600 ? 80 : 64;
  const maxPerRow = Math.max(1, Math.floor((width - cardW) / (cardW * 0.26)) + 1);
  const twoRows = cards.length > maxPerRow;
  const rows = twoRows
    ? [cards.filter((c) => isTrump(c) || c === EXCUSE), cards.filter((c) => !isTrump(c) && c !== EXCUSE)]
    : [cards];

  const layout = (row, r) => {
    const n = row.length;
    const spacing = n > 1 ? Math.min(cardW * 0.62, (width - cardW - 8) / (n - 1)) : 0;
    const total = cardW + spacing * (n - 1);
    const start = (width - total) / 2;
    return row.map((card, i) => {
      const t = n > 1 ? i / (n - 1) - 0.5 : 0;
      return { card, x: start + i * spacing, y: -cardW * 0.12 + r * (twoRows ? -cardW * 0.62 : 0) + t * t * cardW * 0.35, rot: t * Math.min(14, n * 0.9), z: (twoRows ? (1 - r) * 100 : 0) + i };
    });
  };
  const placed = rows.flatMap((row, r) => layout(row, twoRows ? 1 - r : 0));

  const handleTap = (card) => {
    if (flicked.current) { flicked.current = false; return; }
    if (mode === 'discard') { if (!locked.includes(card)) onToggle?.(card); else onRefuse?.(card); return; }
    if (mode !== 'play') return;
    if (!playable.includes(card)) { onRefuse?.(card); return; }
    if (finePointer || armed === card) { setArmed(null); onPlay?.(card); return; }
    setArmed(card);
  };

  return (
    <div
      className={`t-hand t-hand--${mode} ${twoRows ? 'is-two-rows' : ''}`}
      ref={ref}
      // An empty hand (end of a deal) takes no room: what is above it drops to the bottom of the screen.
      style={{ '--card-w': `${cardW}px`, height: cards.length ? cardW * 1.6 + (twoRows ? cardW * 0.62 : 0) + cardW * 0.2 + 14 : 0 }}
    >
      <AnimatePresence initial={false}>
        {placed.map(({ card, x, y, rot, z }) => {
          const isPlayable = mode === 'play' && playable.includes(card);
          const isSelected = selected.includes(card) || armed === card;
          return (
            <motion.button
              key={card}
              type="button"
              className={`t-hand__card ${isPlayable ? 'is-playable' : ''} ${mode === 'play' && !isPlayable ? 'is-dim' : ''} ${isSelected ? 'is-selected' : ''} ${fresh.includes(card) ? 'is-fresh' : ''} ${locked.includes(card) ? 'is-locked' : ''}`}
              style={{ zIndex: z, width: cardW }}
              initial={{ opacity: 0, y: 60, x, rotate: rot }}
              animate={{ opacity: 1, x, y: y - (isSelected ? cardW * 0.32 : 0), rotate: rot }}
              exit={{ opacity: 0, y: -cardW * 2.2, scale: 0.8, transition: { duration: 0.22, ease: [0.23, 1, 0.32, 1] } }}
              transition={{ type: 'spring', bounce: 0.2, duration: 0.45 }}
              onPointerDown={(e) => { drag.current = { card, y: e.clientY }; }}
              onPointerUp={(e) => {
                const d = drag.current;
                drag.current = null;
                // A flick upwards plays the card (touch or mouse).
                if (d?.card === card && d.y - e.clientY > 50 && mode === 'play') {
                  flicked.current = true;
                  if (playable.includes(card)) { setArmed(null); onPlay?.(card); } else onRefuse?.(card);
                }
              }}
              onClick={() => handleTap(card)}
              aria-pressed={isSelected}
              aria-disabled={mode === 'play' && !isPlayable}
            >
              <Card card={card} />
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
