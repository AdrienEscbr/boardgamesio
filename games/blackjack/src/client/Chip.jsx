import { AnimatePresence, motion } from 'motion/react';
import { fmt } from './i18n.js';

/** Chip values on the tray, largest first. Bets go by tens, so they always add up. */
export const CHIP_VALUES = [500, 100, 50, 10];

/** Greedy split of an amount into chips, largest first. */
export function chipsOf(amount) {
  const out = [];
  let left = amount;
  for (const v of CHIP_VALUES) while (left >= v) { out.push(v); left -= v; }
  return out;
}

/** One mother-of-pearl chip. Sized by `--chip` on a parent. */
export function Chip({ value, className = '', ...props }) {
  return (
    <span className={`bj-chip bj-chip--${value} ${className}`} {...props}>
      <span className="bj-chip__value">{value >= 1000 ? `${value / 1000}k` : value}</span>
    </span>
  );
}

const MAX_PER_COLUMN = 6;

/**
 * A pile of chips worth `amount`, one column per value (taller piles are capped), the amount
 * under it. New chips drop in on top; `ghost` draws a bet still being composed.
 */
export function ChipStack({ amount, ghost = false, label = true, className = '' }) {
  const chips = chipsOf(amount);
  const columns = CHIP_VALUES.map((v) => ({ v, n: chips.filter((c) => c === v).length })).filter((c) => c.n);
  return (
    <span className={`bj-stack ${ghost ? 'is-ghost' : ''} ${className}`}>
      <span className="bj-stack__piles">
        <AnimatePresence initial={false}>
          {columns.map(({ v, n }) => (
            <motion.span
              key={v}
              className="bj-stack__pile"
              layout
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.15 } }}
            >
              {Array.from({ length: Math.min(n, MAX_PER_COLUMN) }, (_, i) => (
                <motion.span
                  key={i}
                  className="bj-stack__chip"
                  style={{ '--i': i }}
                  initial={{ y: -26, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 700, damping: 26 }}
                >
                  <Chip value={v} />
                </motion.span>
              ))}
            </motion.span>
          ))}
        </AnimatePresence>
      </span>
      {label && amount > 0 && <span className="bj-stack__amount">{fmt(amount)}</span>}
    </span>
  );
}
