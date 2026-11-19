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

const MAX_CHIPS = 8;

/**
 * A bet as a single pile of chips worth `amount`, the big ones at the bottom (the tallest piles
 * are capped), the amount under it. New chips drop in on top; `ghost` draws a bet still being
 * composed. One column only, so the pile always stays centred.
 */
export function ChipStack({ amount, ghost = false, label = true, className = '' }) {
  const chips = chipsOf(amount).slice(0, MAX_CHIPS);
  return (
    <span className={`bj-stack ${ghost ? 'is-ghost' : ''} ${className}`}>
      <span className="bj-stack__pile" style={{ '--n': Math.max(chips.length, 1) }}>
        <AnimatePresence initial={false}>
          {chips.map((v, i) => (
            <motion.span
              key={`${i}-${v}`}
              className="bj-stack__chip"
              style={{ '--i': i }}
              initial={{ y: -26, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -12, opacity: 0, transition: { duration: 0.12 } }}
              transition={{ type: 'spring', stiffness: 700, damping: 26 }}
            >
              <Chip value={v} />
            </motion.span>
          ))}
        </AnimatePresence>
      </span>
      {label && amount > 0 && <span className="bj-stack__amount">{fmt(amount)}</span>}
    </span>
  );
}
