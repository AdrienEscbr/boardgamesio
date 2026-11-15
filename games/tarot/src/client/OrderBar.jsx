import { Fragment } from 'react';
import Icon from '@bgio/ui/components/Icon.jsx';
import { Avatar } from '@bgio/ui/components/ui.jsx';

/**
 * Who speaks / plays in this round, in order: done ✓, now (lit), next.
 * Answers "who played before me, who plays after me" at a glance.
 */
export default function OrderBar({ label, sequence, doneIds, currentId, me, playersById }) {
  return (
    <div className="t-order" aria-label={`${label} : ordre de jeu`}>
      <span className="t-order__label">{label}</span>
      <ol className="t-order__list">
        {sequence.map((id, i) => {
          const p = playersById[id];
          const done = doneIds.includes(id);
          const now = id === currentId;
          return (
            <Fragment key={id}>
              {i > 0 && <li className="t-order__arrow" aria-hidden>›</li>}
              <li
                className={`t-order__item ${done ? 'is-done' : ''} ${now ? 'is-now' : ''} ${id === me ? 'is-me' : ''}`}
                aria-current={now || undefined}
              >
                <span className="t-order__avatar">
                  {p?.isBot ? <Icon name="bot" size={14} /> : <Avatar name={p?.nickname} index={p?.index ?? 0} size={20} />}
                  {done && <span className="t-order__check"><Icon name="check" size={10} strokeWidth={3} /></span>}
                </span>
                <span className="t-order__name">{id === me ? 'Vous' : p?.nickname}</span>
              </li>
            </Fragment>
          );
        })}
      </ol>
    </div>
  );
}
