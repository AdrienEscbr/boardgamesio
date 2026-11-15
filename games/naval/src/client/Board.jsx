import { useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { SIZE, colOf, rowOf, lengthOf, cellName } from '../engine/index.js';
import Ship from './Ship.jsx';
import { Bubbles, Explosion, Fire, Shell, Splash } from './effects.jsx';

const LETTERS = 'ABCDEFGHIJ';

/** Absolute position of a ship strip on the grid (in cells, via the --cell variable). */
function shipStyle({ type, cell, dir }) {
  const len = lengthOf(type);
  return {
    left: `calc(var(--cell) * ${colOf(cell)})`,
    top: `calc(var(--cell) * ${rowOf(cell)})`,
    width: `calc(var(--cell) * ${len})`,
    height: 'var(--cell)',
    // Vertical ships: the strip turns around its top-left corner and slides back under it.
    transform: dir === 'v' ? 'rotate(90deg) translateY(-100%)' : undefined,
  };
}
const cellStyle = (cell) => ({ left: `calc(var(--cell) * ${colOf(cell)})`, top: `calc(var(--cell) * ${rowOf(cell)})` });

/**
 * A 10×10 sea grid tilted in perspective.
 *
 * @param ships     visible ships afloat [{ type, cell, dir }]
 * @param wrecks    sunk ships [{ type, cell, dir, cells, fresh? }] (fresh = sinking now)
 * @param received  { [cell]: 'miss' | 'hit' }
 * @param fx        transient impacts [{ id, cell, kind: 'splash' | 'boom' | 'sunk' }]
 * @param shells    shells in flight [{ id, cell, from: 'near' | 'far' }]; onLand(id) at impact
 * @param onCell    makes the grid a target (click a cell to shoot)
 * @param aims      cells aimed at, not fired yet; locked: fired, waiting for the server
 * @param tilt      degrees
 */
export default function Board({ ships = [], wrecks = [], received = {}, fx = [], shells = [], aims = [], locked = [], onLand, onCell, tilt = 30, label, className = '', style }) {
  const root = useRef(null);
  const cellRefs = useRef([]);
  const [, force] = useState(0);
  useLayoutEffect(() => { force((n) => n + 1); }, []);

  const wreckCells = new Set(wrecks.flatMap((w) => w.cells ?? []));
  const fires = Object.entries(received).filter(([c, r]) => r === 'hit' && !wreckCells.has(Number(c))).map(([c]) => Number(c));

  // Screen positions for shells: from the near (bottom) or far (top) edge to the cell centre.
  const pointOf = (cell) => {
    const r = root.current?.getBoundingClientRect();
    const c = cellRefs.current[cell]?.getBoundingClientRect();
    if (!r || !c) return null;
    return { x: c.left - r.left + c.width / 2, y: c.top - r.top + c.height / 2 };
  };
  const startOf = (from) => {
    const r = root.current?.getBoundingClientRect();
    return { x: (r?.width ?? 0) / 2, y: from === 'far' ? -40 : (r?.height ?? 0) + 60 };
  };

  return (
    <div className={`nv-board ${onCell ? 'is-target' : ''} ${className}`} ref={root} style={{ '--tilt': `${tilt}deg`, ...style }}>
      {label && <div className="nv-board__label">{label}</div>}
      <div className="nv-stage">
        <div className="nv-plane">
          <div className="nv-coords nv-coords--cols" aria-hidden>{Array.from({ length: SIZE }, (_, i) => <span key={i}>{i + 1}</span>)}</div>
          <div className="nv-coords nv-coords--rows" aria-hidden>{LETTERS.split('').map((l) => <span key={l}>{l}</span>)}</div>

          {/* sunk ships lie under the surface */}
          {wrecks.map((w) => (
            <div key={`w-${w.type}`} className={`nv-shipwrap is-wreck ${w.fresh ? 'is-sinking' : ''}`} style={shipStyle(w)}>
              <Ship type={w.type} />
            </div>
          ))}
          {ships.map((s) => (
            <div key={s.type} className="nv-shipwrap" style={shipStyle(s)}>
              <Ship type={s.type} />
            </div>
          ))}

          {/* markers */}
          {Object.entries(received).map(([c, r]) => (
            <span key={`m${c}`} className={`nv-mark is-${r}`} style={cellStyle(Number(c))} />
          ))}

          {/* aimed cells */}
          {aims.map((c) => <span key={`a${c}`} className="nv-aim" style={cellStyle(c)} />)}
          {locked.map((c) => <span key={`l${c}`} className="nv-aim is-locked" style={cellStyle(c)} />)}

          {/* standing effects */}
          {fires.map((c) => <span key={`f${c}`} className="nv-fx" style={cellStyle(c)}><Fire seed={c} /></span>)}
          {[...wreckCells].map((c) => <span key={`s${c}`} className="nv-fx" style={cellStyle(c)}><Fire seed={c} smoulder /></span>)}
          <AnimatePresence>
            {fx.map((f) => (
              <motion.span key={f.id} className="nv-fx" style={cellStyle(f.cell)} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
                {f.kind === 'splash' ? <Splash /> : <Explosion big={f.kind === 'sunk'} />}
                {f.kind === 'sunk' && <Bubbles />}
              </motion.span>
            ))}
          </AnimatePresence>

          {/* the cells themselves (hover reticle, clicks) */}
          <div className="nv-cells">
            {Array.from({ length: SIZE * SIZE }, (_, c) => {
              const shot = !!received[c];
              return (
                <button
                  key={c}
                  ref={(el) => { cellRefs.current[c] = el; }}
                  type="button"
                  className={`nv-cell ${shot ? 'is-shot' : ''}`}
                  disabled={!onCell || shot}
                  onClick={() => onCell?.(c)}
                  aria-label={onCell ? `Tirer en ${cellName(c)}` : cellName(c)}
                  tabIndex={onCell && !shot ? 0 : -1}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* shells fly above everything, in screen space */}
      <div className="nv-sky" aria-hidden>
        {shells.map((s) => {
          const to = pointOf(s.cell);
          if (!to) return null;
          return <Shell key={s.id} from={startOf(s.from)} to={to} delay={s.delay ?? 0} onLand={() => onLand?.(s.id)} />;
        })}
      </div>
    </div>
  );
}
