import { AnimatePresence, motion } from 'motion/react';
import { Avatar } from '@bgio/ui/components/ui.jsx';
import Hand from './Hand.jsx';
import { ChipStack } from './Chip.jsx';
import { fmt } from './i18n.js';

/** End of a round: the cards are swept up towards the dealer. */
export const SWEEP = { opacity: 0, y: -90, scale: 0.7, rotate: -6, transition: { duration: 0.45, ease: [0.5, 0, 0.75, 0] } };

/** How far a seat leans inwards: only the seats near a side of the table (0..100, 50 = centred). */
const lean = (x) => 50 + Math.sign(x - 50) * Math.max(0, Math.abs(x - 50) - 25) * 2;

/**
 * A player's place at the table: name and stack on a brass plate, the betting box in front,
 * the hands in it. `draft` is my bet being composed (shown as ghost chips).
 */
export default function Seat({ p, v, isMe, draft = 0, delayOf, compact = false, state, pos, revealMs = 0, onClearBet, onRemoveChip, onPass, busy = false }) {
  const settled = v.phase === 'settle' || v.phase === 'over';
  const activeHand = v.phase === 'play' && v.turn?.playerId === p.id ? v.turn.hand : -1;
  const betting = v.phase === 'bet';
  const name = isMe ? 'Vous' : p.nickname;
  const hasHands = p.hands.length > 0;
  return (
    <div
      className={`bj-seat ${isMe ? 'is-me' : ''} ${compact ? 'is-compact' : ''} ${activeHand >= 0 ? 'is-active' : ''} ${p.out ? 'is-out' : ''} ${p.connected === false && !p.isBot ? 'is-away' : ''} ${onRemoveChip && !p.betPlaced ? 'is-betting' : ''}`}
      style={{ '--seat': p.seat, ...(pos && { '--x': `${pos.x}%`, '--y': `${pos.y}%`, '--ax': lean(pos.x) }) }}
    >
      <div className="bj-seat__box">
        <AnimatePresence mode="popLayout" initial={false}>
          {hasHands ? (
            <motion.div key={`hands-${v.roundNumber}`} className={`bj-seat__hands ${p.hands.length > 1 ? 'is-split' : ''}`} exit={SWEEP}>
              {p.hands.map((h, i) => (
                <Hand
                  key={i}
                  hand={h}
                  active={i === activeHand}
                  settled={settled}
                  delayOf={(k) => delayOf?.(p.id, i, k) ?? 0}
                  betId={i === 0 ? `bet-${p.id}` : undefined}
                  revealMs={revealMs}
                  label={`${name}${p.hands.length > 1 ? `, main ${i + 1}` : ''}`}
                />
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="spot"
              className={`bj-spot ${betting && !p.betPlaced && !p.out ? 'is-waiting' : ''}`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1, transition: { delay: 0.5 } }}
              exit={{ opacity: 0, transition: { duration: 0 } }}
            >
              {betting && isMe && !p.betPlaced && draft > 0 && <ChipStack amount={draft} ghost onPick={busy ? undefined : onRemoveChip} />}
              {betting && isMe && !p.betPlaced && draft === 0 && onClearBet && <span className="bj-spot__hint">vos jetons ici</span>}
              {betting && p.betPlaced && p.bet > 0 && <ChipStack amount={p.bet} layoutId={`bet-${p.id}`} />}
              {/* The others' chips going down, live, before they bet. */}
              {betting && !isMe && !p.betPlaced && p.draft > 0 && <ChipStack amount={p.draft} ghost />}
              {/* A player who passed keeps the word in the box for the whole round. */}
              {!p.out && (betting ? p.betPlaced && p.bet === 0 : !hasHands) && <span className="bj-spot__pass">passe</span>}
              {p.out && <span className="bj-spot__pass">sans jetons</span>}
            </motion.div>
          )}
        </AnimatePresence>
        {onClearBet && !hasHands && draft > 0 && (
          <button type="button" className="bj-plaque bj-plaque--table bj-plaque--muted bj-side bj-side--left" onClick={onClearBet} disabled={busy} title="Retour arrière">
            <span className="bj-plaque__face"><span className="bj-plaque__label">Effacer</span><span className="bj-plaque__sub">toute la mise</span></span>
          </button>
        )}
        {onPass && !hasHands && (
          <button type="button" className="bj-plaque bj-plaque--table bj-side bj-side--right" onClick={onPass} disabled={busy}>
            <span className="bj-plaque__face"><span className="bj-plaque__label">Passer</span><span className="bj-plaque__sub">la manche</span></span>
          </button>
        )}
      </div>

      <div className="bj-plate">
        <Avatar name={p.nickname} index={p.seat} size={compact ? 22 : 28} online={p.connected !== false} />
        <span className="bj-plate__who">
          <span className="bj-plate__name">{name}</span>
          {/* What the player is doing replaces the stack for a moment. */}
          {state ? (
            <span key={`s-${state}`} className="bj-plate__state">{state}</span>
          ) : (
            <span key="stack" className="bj-plate__stack" aria-label={`${fmt(p.stack)} jetons`}>{fmt(p.stack)}</span>
          )}
        </span>
      </div>
    </div>
  );
}
