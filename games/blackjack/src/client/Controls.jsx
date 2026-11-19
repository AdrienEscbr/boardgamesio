import { motion } from 'motion/react';
import { valueOf } from '../engine/cards.js';
import { basicStrategy } from '../engine/bot.js';
import { CHIP_VALUES, Chip } from './Chip.jsx';
import { fmt } from './i18n.js';

/**
 * The chip tray while bets are open: tap a chip to add it to the bet (shown as ghost chips in
 * my box), then confirm. Chips that would go over the stack are greyed out.
 */
export function BetTray({ draft, stack, minBet, step, lastBet, busy, onAdd, onSet, onClear, onConfirm, onPass }) {
  const max = stack - (stack % step);
  const ok = draft >= minBet && draft <= max;
  const again = lastBet && lastBet <= max && lastBet >= minBet ? lastBet : null;
  return (
    <div className="bj-tray" role="group" aria-label="Votre mise">
      <div className="bj-tray__chips">
        {CHIP_VALUES.slice().reverse().map((value) => {
          const off = busy || draft + value > max;
          return (
            <motion.button
              key={value}
              type="button"
              className="bj-tray__chip"
              disabled={off}
              onClick={() => onAdd(value)}
              whileTap={{ scale: 0.9, y: 2 }}
              aria-label={`Ajouter ${value}`}
            >
              <Chip value={value} />
            </motion.button>
          );
        })}
      </div>
      <div className="bj-tray__quick">
        <button type="button" className="bj-pill" disabled={busy || minBet > max} onClick={() => onSet(minBet)}>Min</button>
        {again != null && <button type="button" className="bj-pill" disabled={busy} onClick={() => onSet(again)}>Même mise · {fmt(again)}</button>}
        {again != null && again * 2 <= max && <button type="button" className="bj-pill" disabled={busy} onClick={() => onSet(again * 2)}>×2</button>}
        <button type="button" className="bj-pill" disabled={busy || max < minBet} onClick={() => onSet(max)}>Tapis</button>
        <button type="button" className="bj-pill bj-pill--ghost" disabled={busy || !draft} onClick={onClear}>Effacer</button>
      </div>
      <div className="bj-tray__go">
        <button type="button" className="bj-btn bj-btn--ghost" disabled={busy} onClick={onPass}>Passer</button>
        <button type="button" className="bj-btn bj-btn--gold" disabled={busy || !ok} onClick={onConfirm}>
          {draft ? `Miser ${fmt(draft)}` : `Mise de ${fmt(minBet)} au moins`}
        </button>
      </div>
      <span className="bj-tray__hint">
        {draft > 0 ? `Il vous restera ${fmt(stack - draft)}.` : `Votre tapis : ${fmt(stack)}.`}
      </span>
    </div>
  );
}

/** Chance (0..1) that one more card busts a hand worth `total` (hard), with an infinite shoe. */
export function bustChance(total, soft) {
  if (soft) return 0;
  // Card values 2..9 one each, 10 four times, ace (1) once: 13 ranks.
  const values = [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10, 1];
  return values.filter((x) => total + x > 21).length / values.length;
}

const ACTIONS = [
  { type: 'hit', label: 'Tirer', key: 't' },
  { type: 'stand', label: 'Rester', key: 'r' },
  { type: 'double', label: 'Doubler', key: 'd' },
  { type: 'split', label: 'Séparer', key: 's' },
];

/**
 * My four moves on the hand in turn. Each says what it will do before it is chosen: the risk
 * of busting, the total kept, what doubling or splitting costs; the basic strategy's move is
 * marked when advice is on.
 */
export function ActionBar({ hand, upCard, legal, stack, advice, busy, onAct }) {
  const best = advice ? basicStrategy(hand.cards, upCard, legal) : null;
  const risk = Math.round(bustChance(hand.total, hand.soft) * 100);
  const notes = {
    hit: risk ? `${risk} % de sauter` : 'sans risque',
    stand: `rester à ${hand.total}`,
    double: legal.double ? `+${fmt(hand.bet)}, une carte` : stack < hand.bet ? 'jetons insuffisants' : 'deux cartes seulement',
    split: legal.split ? `+${fmt(hand.bet)}, deux mains` : hand.cards.length === 2 && valueOf(hand.cards[0]) === valueOf(hand.cards[1]) ? 'impossible ici' : 'paire seulement',
  };
  return (
    <div className="bj-actions" role="group" aria-label="Votre coup">
      {ACTIONS.map(({ type, label, key }) => (
        <motion.button
          key={type}
          type="button"
          className={`bj-action bj-action--${type} ${best === type ? 'is-advised' : ''}`}
          disabled={busy || !legal[type]}
          onClick={() => onAct(type)}
          whileTap={{ scale: 0.94 }}
          aria-keyshortcuts={key.toUpperCase()}
        >
          <span className="bj-action__label">{label}<kbd>{key.toUpperCase()}</kbd></span>
          <span className="bj-action__note">{notes[type]}</span>
          {best === type && <span className="bj-action__tip">conseil</span>}
        </motion.button>
      ))}
    </div>
  );
}
