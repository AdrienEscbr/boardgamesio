import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Avatar } from '@bgio/ui/components/ui.jsx';
import Icon from '@bgio/ui/components/Icon.jsx';
import { serverNow } from '@bgio/ui/lib/store.js';
import Card from './Card.jsx';
import { BID_LABELS, CONTRACT_LABELS } from './i18n.js';

/** Ring emptying over the decision time. CSS animation, mounted once per decision (keyed by the parent). */
export function TurnRing({ endsAt, durationMs }) {
  const [elapsed] = useState(() => Math.max(0, durationMs - Math.max(0, endsAt - serverNow())));
  if (!endsAt || !durationMs) return null;
  return (
    <svg className="t-ring" viewBox="0 0 52 52" aria-hidden>
      <circle className="t-ring__track" cx="26" cy="26" r="24" />
      <circle className="t-ring__bar" cx="26" cy="26" r="24" pathLength="100" style={{ animationDuration: `${durationMs}ms`, animationDelay: `-${elapsed}ms` }} />
    </svg>
  );
}

/** The cards an opponent holds, face down and upright, placed on the table side of their seat. */
function HiddenHand({ count, inward }) {
  const shown = Math.min(count, 7);
  if (!shown) return null;
  return (
    <div className={`t-hidden ${inward.side ? 'is-side' : ''}`} style={{ '--dx': inward.x, '--dy': inward.y }} aria-label={`${count} cartes en main`}>
      {Array.from({ length: shown }, (_, i) => (
        <span key={i} className="t-hidden__card" style={{ '--i': i - (shown - 1) / 2 }}><Card faceDown /></span>
      ))}
      <span className="t-hidden__count tabular">{count}</span>
    </div>
  );
}

const TEAM_LABEL = { attack: 'Attaque', defense: 'Défense', unknown: 'Camp inconnu' };

/**
 * A player around the table: avatar, name, running total, tricks won, camp,
 * role badges, the hidden hand and, during the auction, the bid in a bubble.
 */
export default function Seat({ player, view, turn, index, isMe, style, compact, bubbleBelow, team, inward, spotlight }) {
  const active = turn?.playerId === player.id && !turn?.paused;
  const bid = view.phase === 'bidding' || view.phase === 'calling' ? view.bids.find((b) => b.playerId === player.id)?.bid : null;
  const taker = view.takerId === player.id;
  const partner = view.partnerId && view.partnerId === player.id;
  const dealer = view.dealerId === player.id;
  const poignee = view.poignees.find((p) => p.playerId === player.id);
  const playing = view.phase === 'playing' || view.phase === 'scoring';
  return (
    <div
      className={`t-seat ${active ? 'is-active' : ''} ${isMe ? 'is-me' : ''} ${compact ? 't-seat--compact' : ''} ${team ? `team-${team}` : ''} ${spotlight ? 'is-spotlight' : ''}`}
      style={style}
      title={team ? TEAM_LABEL[team] : undefined}
    >
      {/* Hidden during the auction: everyone holds a full hand and the bid bubbles need the room. */}
      {!isMe && inward && !bid && view.phase !== 'bidding' && view.phase !== 'calling' && <HiddenHand count={player.handCount ?? 0} inward={inward} />}
      <div className="t-seat__avatar">
        {player.isBot
          ? <span className="t-bot"><Icon name="bot" size={compact ? 18 : 22} /></span>
          : <Avatar name={player.nickname} index={index} size={compact ? 34 : 44} online={player.connected !== false} />}
        {active && turn?.endsAt && <TurnRing key={turn.key} endsAt={turn.endsAt} durationMs={turn.durationMs} />}
        {dealer && <span className="t-seat__dealer" title="Donneur">D</span>}
      </div>
      <div className="t-seat__info">
        <span className="t-seat__name">{isMe ? 'Vous' : player.nickname}</span>
        <span className="t-seat__score tabular" title="Score total de la partie">
          <span className="t-seat__label">Total</span> {player.score > 0 ? '+' : ''}{player.score}
        </span>
      </div>
      <div className="t-seat__badges">
        {taker && view.contract && <span className="t-chip t-chip--taker">{CONTRACT_LABELS[view.contract]}</span>}
        {partner && <span className="t-chip t-chip--partner">Appelé</span>}
        {poignee && <span className="t-chip">Poignée</span>}
        {playing && <span className="t-chip t-chip--tricks tabular" title="Plis remportés dans cette donne">{player.tricksWon} pli{player.tricksWon > 1 ? 's' : ''}</span>}
      </div>
      <AnimatePresence>
        {bid && (
          <motion.span
            key={bid}
            className={`t-bubble ${bid === 'PASS' ? 'is-pass' : ''} ${bubbleBelow ? 'is-below' : ''}`}
            initial={{ opacity: 0, scale: 0.6, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', bounce: 0.45, duration: 0.45 }}
          >
            {BID_LABELS[bid]}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
