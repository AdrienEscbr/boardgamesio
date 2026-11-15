import { useState } from 'react';
import { motion } from 'motion/react';
import Disc from './Disc.jsx';

/** One disc in its hole. The drop is computed once, when the disc appears. */
function Slot({ seat, c, r, rows, win, clearing }) {
  const [drop] = useState(() => {
    const fall = (rows - r) * 100 + 30; // from above the top edge, in % of a disc
    return {
      initial: { y: `-${fall}%` },
      animate: { y: [`-${fall}%`, '0%', '-14%', '0%', '-4%', '0%'] },
      transition: { duration: 0.32 + Math.sqrt(rows - r) * 0.12, times: [0, 0.55, 0.72, 0.85, 0.93, 1], ease: ['easeIn', 'easeOut', 'easeIn', 'easeOut', 'easeIn'] },
    };
  });
  const [out] = useState(() => ({ y: `${(r + 1.5) * 100}%`, transition: { duration: 0.5 + r * 0.05, delay: c * 0.03 + (rows - r) * 0.02, ease: [0.55, 0, 1, 0.45] } }));
  return (
    <motion.span
      className={`p4-slot ${win ? 'is-win' : ''}`}
      style={{ left: `calc(var(--cell) * ${c})`, bottom: `calc(var(--cell) * ${r})` }}
      initial={drop.initial}
      animate={clearing ? out : drop.animate}
      transition={drop.transition}
    >
      <Disc seat={seat} />
    </motion.span>
  );
}

/**
 * The wooden board. Discs sit BEHIND a wooden face pierced with holes: they are seen
 * falling through the holes, as on a real board.
 *
 * @param board     flat array (row 0 at the bottom), seat index or -1
 * @param line      winning cells (they light up)
 * @param clearing  the round is over: every disc drops out through the bottom
 * @param ghostSeat colour of the disc held above the board (the player to move), or null
 * @param playable  columns one may drop into; onDrop(col) when one is chosen
 */
export default function Board({ cols, rows, board, line = null, clearing = false, ghostSeat = null, playable = [], onDrop, className = '', style }) {
  const [hover, setHover] = useState(null);
  const lit = new Set(line ?? []);
  const canPlay = !!onDrop && ghostSeat != null;
  const col = canPlay && hover != null && playable.includes(hover) ? hover : null;

  return (
    <div className={`p4-board ${canPlay ? 'is-live' : ''} ${className}`} style={{ '--cols': cols, '--rows': rows, ...style }}>
      {/* the disc held above the column under the pointer */}
      <div className="p4-hopper" aria-hidden>
        {col != null && (
          <motion.span className="p4-ghost" initial={false} animate={{ x: `${col * 100}%` }} transition={{ type: 'spring', stiffness: 700, damping: 40 }}>
            <Disc seat={ghostSeat} />
          </motion.span>
        )}
      </div>

      <div className="p4-frame">
        <div className="p4-well">
          {/* discs, behind the face */}
          <div className="p4-discs">
            {board.map((seat, cell) => {
              if (seat < 0) return null;
              const c = cell % cols;
              const r = Math.floor(cell / cols);
              return <Slot key={`${cell}-${seat}`} seat={seat} c={c} r={r} rows={rows} win={lit.has(cell)} clearing={clearing} />;
            })}
          </div>
          {/* the wooden face with its holes, then the shading inside each hole */}
          <div className="p4-face" />
          <div className="p4-rims" />
          {/* the winning line, drawn over the face */}
          {line && !clearing && (
            <svg className="p4-line" viewBox={`0 0 ${cols} ${rows}`} preserveAspectRatio="none" aria-hidden>
              {(() => {
                const pts = [...line].sort((a, b) => a - b).map((cell) => ({ x: (cell % cols) + 0.5, y: rows - Math.floor(cell / cols) - 0.5 }));
                const a = pts[0];
                const b = pts[pts.length - 1];
                return <motion.line x1={a.x} y1={a.y} x2={b.x} y2={b.y} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: 0.35, ease: 'easeOut' }} />;
              })()}
            </svg>
          )}
          {/* columns: hover and click */}
          {canPlay && (
            <div className="p4-columns" onPointerLeave={() => setHover(null)}>
              {Array.from({ length: cols }, (_, c) => (
                <button
                  key={c}
                  type="button"
                  className={`p4-col ${col === c ? 'is-hover' : ''}`}
                  disabled={!playable.includes(c)}
                  onPointerEnter={() => setHover(c)}
                  onFocus={() => setHover(c)}
                  onClick={() => onDrop(c)}
                  aria-label={`Colonne ${c + 1}`}
                />
              ))}
            </div>
          )}
        </div>
        {/* brass rivets */}
        {['tl', 'tr', 'bl', 'br'].map((k) => <span key={k} className={`p4-rivet p4-rivet--${k}`} aria-hidden />)}
      </div>
      <div className="p4-feet" aria-hidden><span /><span /></div>
    </div>
  );
}
