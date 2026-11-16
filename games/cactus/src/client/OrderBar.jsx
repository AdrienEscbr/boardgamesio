import { Fragment } from 'react';
import Icon from '@bgio/ui/components/Icon.jsx';
import { Avatar } from '@bgio/ui/components/ui.jsx';

/**
 * Who plays in this round of the table, in order: done ✓, now (lit), still to play.
 * After "Cactus", it lists the last turns: everyone else, then the caller.
 */
export default function OrderBar({ view, nameOf }) {
  const n = view.players.length;
  const at = (k) => view.players[k % n];
  const active = !!view.turn;
  let label;
  let sequence;
  let done;
  const calling = view.cactusBy && view.turnNumber === view.cactusTurn; // the call's own turn
  if (view.cactusBy && !calling) {
    const c = view.players.findIndex((p) => p.id === view.cactusBy);
    sequence = Array.from({ length: n }, (_, k) => at(c + 1 + k)); // the caller is last
    const k = (view.turnSeat - c - 1 + n) % n;
    done = view.closing ? sequence : sequence.slice(0, active ? k : k + 1);
    label = 'Dernier tour';
  } else {
    sequence = Array.from({ length: n }, (_, k) => at(view.roundStarter + k));
    const k = (view.turnSeat - view.roundStarter + n) % n;
    done = view.phase === 'play' ? sequence.slice(0, active ? k : k + 1) : [];
    label = 'Tour de table';
  }
  const doneIds = new Set(done.map((p) => p.id));
  const currentId = view.phase === 'play' ? view.turn : null;
  return (
    <div className={`ct-orderbar ${view.cactusBy && !calling ? 'is-last' : ''}`} aria-label={`${label} : ordre de jeu`}>
      <span className="ct-orderbar__label">{label}</span>
      <ol className="ct-orderbar__list">
        {sequence.map((p, i) => {
          const isDone = doneIds.has(p.id) && p.id !== currentId;
          const now = p.id === currentId;
          return (
            <Fragment key={p.id}>
              {i > 0 && <li className="ct-orderbar__arrow" aria-hidden>›</li>}
              <li className={`ct-orderbar__item ${isDone ? 'is-done' : ''} ${now ? 'is-now' : ''} ${p.id === view.me ? 'is-me' : ''} ${p.id === view.cactusBy ? 'is-caller' : ''}`} aria-current={now || undefined}>
                <span className="ct-orderbar__avatar">
                  {p.isBot ? <Icon name="bot" size={14} /> : <Avatar name={p.nickname ?? nameOf(p.id)} index={p.seat} size={20} />}
                  {isDone && <span className="ct-orderbar__check"><Icon name="check" size={10} strokeWidth={3} /></span>}
                </span>
                <span className="ct-orderbar__name">{nameOf(p.id)}</span>
              </li>
            </Fragment>
          );
        })}
      </ol>
      {view.cactusBy && <span className="ct-orderbar__caller"><CactusGlyph size={12} />{nameOf(view.cactusBy)}</span>}
    </div>
  );
}

/** A small saguaro, the mark of the caller (ribbon, order bar, recap). */
export function CactusGlyph({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="9.5" y="2" width="5" height="21" rx="2.5" />
      <path d="M9.5 14H6.5a2.5 2.5 0 0 1-2.5-2.5V7.5a1.5 1.5 0 0 1 3 0V11h2.5z" />
      <path d="M14.5 11h3a2.5 2.5 0 0 0 2.5-2.5V5.5a1.5 1.5 0 0 0-3 0V8h-2.5z" />
    </svg>
  );
}
