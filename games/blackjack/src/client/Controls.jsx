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
  const quick = [
    { label: 'Min', amount: minBet, show: minBet <= max },
    { label: again != null ? `Même · ${fmt(again)}` : null, amount: again, show: again != null && again !== minBet },
    { label: '×2', amount: draft * 2, show: draft > 0 && draft * 2 <= max },
    { label: 'Tapis', amount: max, show: max >= minBet },
  ].filter((q) => q.show && q.label);
  return (
    <div className="bj-tray" role="group" aria-label="Votre mise">
      <div className="bj-tray__chips">
        {CHIP_VALUES.slice().reverse().map((value) => (
          <motion.button
            key={value}
            type="button"
            className="bj-tray__chip"
            disabled={busy || draft + value > max}
            onClick={() => onAdd(value)}
            whileTap={{ scale: 0.88, y: 2 }}
            aria-label={`Ajouter ${value}`}
          >
            <Chip value={value} />
          </motion.button>
        ))}
      </div>
      <div className="bj-tray__bar">
        <div className="bj-tray__quick">
          {quick.map((q) => (
            <button key={q.label} type="button" className={`bj-link ${draft === q.amount ? 'is-on' : ''}`} disabled={busy} onClick={() => onSet(q.amount)}>{q.label}</button>
          ))}
          <button type="button" className="bj-link bj-link--dim" disabled={busy || !draft} onClick={onClear}>Effacer</button>
          <span className="bj-tray__hint">{draft > 0 ? `reste ${fmt(stack - draft)}` : `tapis ${fmt(stack)}`}</span>
        </div>
        <div className="bj-tray__go">
          <button type="button" className="bj-btn bj-btn--quiet" disabled={busy} onClick={onPass}>Passer</button>
          <button type="button" className="bj-btn bj-btn--gold" disabled={busy || !ok} onClick={onConfirm}>
            {draft ? <>Miser <b>{fmt(draft)}</b></> : `Min. ${fmt(minBet)}`}
          </button>
        </div>
      </div>
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

/** Engraved gold glyphs, one per move (24 × 24, stroked). */
const GLYPHS = {
  // one more card
  hit: (
    <>
      <rect x="4.5" y="3" width="11" height="15" rx="1.8" />
      <path d="M17 13.5v7M13.5 17h7" />
    </>
  ),
  // the hand held flat over the cards: I stay
  stand: (
    <>
      <path d="M8 12.5V6.2a1.4 1.4 0 0 1 2.8 0V11" />
      <path d="M10.8 11V4.6a1.4 1.4 0 0 1 2.8 0V11" />
      <path d="M13.6 11V5.6a1.4 1.4 0 0 1 2.8 0V12" />
      <path d="M16.4 12V8.6a1.4 1.4 0 0 1 2.8 0v5.2c0 4-2.8 7.2-6.8 7.2h-.8c-2.6 0-4.4-1.4-5.6-3.6L4.2 13.5a1.4 1.4 0 0 1 2.4-1.4L8 14" />
    </>
  ),
  // two chips: twice the bet
  double: (
    <>
      <ellipse cx="10" cy="15.5" rx="6" ry="2.6" />
      <path d="M4 15.5v2c0 1.4 2.7 2.6 6 2.6s6-1.2 6-2.6v-2" />
      <ellipse cx="14" cy="8" rx="6" ry="2.6" />
      <path d="M8 8v2c0 1.4 2.7 2.6 6 2.6s6-1.2 6-2.6V8" />
    </>
  ),
  // a pair pulled apart
  split: (
    <>
      <rect x="2.6" y="5" width="8.4" height="12.5" rx="1.5" transform="rotate(-12 6.8 11.25)" />
      <rect x="13" y="5" width="8.4" height="12.5" rx="1.5" transform="rotate(12 17.2 11.25)" />
      <path d="M10.5 20.5h3M9 19l-1.5 1.5L9 22M15 19l1.5 1.5L15 22" />
    </>
  ),
};

/**
 * My four moves on the hand in turn: lacquered plaques with cut corners and a gilded rim.
 * Each says what it will do before it is chosen: the risk of busting, the total kept, what
 * doubling or splitting costs; the basic strategy's move shimmers when advice is on.
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
          whileTap={{ scale: 0.95 }}
          aria-keyshortcuts={key.toUpperCase()}
        >
          <span className="bj-action__face">
            <svg className="bj-action__glyph" viewBox="0 0 24 24" aria-hidden>{GLYPHS[type]}</svg>
            <span className="bj-action__text">
              <span className="bj-action__label">{label}</span>
              <span className="bj-action__note">{notes[type]}</span>
            </span>
            <kbd>{key.toUpperCase()}</kbd>
            {best === type && <span className="bj-action__tip">conseil</span>}
          </span>
        </motion.button>
      ))}
    </div>
  );
}
