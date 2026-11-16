import { Fragment } from 'react';
import Icon from '@bgio/ui/components/Icon.jsx';
import { Avatar } from '@bgio/ui/components/ui.jsx';

/**
 * Who plays in this round of the table, in order: done ✓, now (lit), still to play.
 * Same reading as TarotIO's bar. After "Dutch", it lists only the last turns.
 */
export default function OrderBar({ view, nameOf }) {
  const n = view.players.length;
  const at = (k) => view.players[k % n];
  let label;
  let sequence;
  let done;
  if (view.dutchBy) {
    // the last turns: from the player after the caller to the one before
    const c = view.players.findIndex((p) => p.id === view.dutchBy);
    sequence = Array.from({ length: n - 1 }, (_, k) => at(c + 1 + k));
    const played = (view.turnSeat - c + n) % n; // turns already ended since the call
    done = sequence.slice(0, Math.max(0, view.window ? played : played - 1));
    label = 'Dernier tour';
  } else {
    sequence = Array.from({ length: n }, (_, k) => at(view.roundStarter + k));
    const k = (view.turnSeat - view.roundStarter + n) % n;
    done = view.phase === 'play' ? sequence.slice(0, view.window ? k + 1 : k) : [];
    label = 'Tour de table';
  }
  const doneIds = new Set(done.map((p) => p.id));
  const currentId = view.phase === 'play' && !view.window ? view.turn : null;
  return (
    <div className={`dt-orderbar ${view.dutchBy ? 'is-last' : ''}`} aria-label={`${label} : ordre de jeu`}>
      <span className="dt-orderbar__label">{label}</span>
      <ol className="dt-orderbar__list">
        {sequence.map((p, i) => {
          const isDone = doneIds.has(p.id);
          const now = p.id === currentId;
          return (
            <Fragment key={p.id}>
              {i > 0 && <li className="dt-orderbar__arrow" aria-hidden>›</li>}
              <li className={`dt-orderbar__item ${isDone ? 'is-done' : ''} ${now ? 'is-now' : ''} ${p.id === view.me ? 'is-me' : ''}`} aria-current={now || undefined}>
                <span className="dt-orderbar__avatar">
                  {p.isBot ? <Icon name="bot" size={14} /> : <Avatar name={p.nickname ?? nameOf(p.id)} index={p.seat} size={20} />}
                  {isDone && <span className="dt-orderbar__check"><Icon name="check" size={10} strokeWidth={3} /></span>}
                </span>
                <span className="dt-orderbar__name">{nameOf(p.id)}</span>
              </li>
            </Fragment>
          );
        })}
      </ol>
      {view.dutchBy && <span className="dt-orderbar__caller"><Icon name="lock" size={11} strokeWidth={2.8} />{nameOf(view.dutchBy)}</span>}
    </div>
  );
}
