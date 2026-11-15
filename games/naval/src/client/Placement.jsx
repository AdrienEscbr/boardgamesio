import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { SIZE, colOf, fleetError, lengthOf, rowOf, shipCells } from '../engine/index.js';
import { haptic, sound } from '@bgio/ui/lib/feedback.js';
import Ship from './Ship.jsx';

const LETTERS = 'ABCDEFGHIJ';

const place = (ship) => ({
  left: `calc(var(--cell) * ${colOf(ship.cell)})`,
  top: `calc(var(--cell) * ${rowOf(ship.cell)})`,
  width: `calc(var(--cell) * ${lengthOf(ship.type)})`,
  height: 'var(--cell)',
  transform: ship.dir === 'v' ? 'rotate(90deg) translateY(-100%)' : undefined,
});

/** Is `ship` (replacing the ship of the same type) a legal position in `layout`? */
function fits(layout, ship) {
  if (!shipCells(ship.cell, ship.dir, lengthOf(ship.type))) return false;
  return !fleetError(layout.map((s) => (s.type === ship.type ? ship : s)));
}

/**
 * Flat grid where the fleet is arranged: drag a ship to move it, tap it to turn it.
 * The preview shows in green where it may go, in red where it may not.
 */
export default function PlacementBoard({ layout, onChange, disabled }) {
  const plane = useRef(null);
  const drag = useRef(null);
  const [preview, setPreview] = useState(null); // { ship, ok }
  const [shake, setShake] = useState(null); // type of the ship that refused to move

  const cellAt = (e) => {
    const r = plane.current.getBoundingClientRect();
    const size = r.width / SIZE;
    const col = Math.floor((e.clientX - r.left) / size);
    const row = Math.floor((e.clientY - r.top) / size);
    if (col < 0 || row < 0 || col >= SIZE || row >= SIZE) return null;
    return row * SIZE + col;
  };

  const refuse = (type) => {
    setShake(type);
    haptic('error');
    sound('error');
    setTimeout(() => setShake(null), 400);
  };

  const onDown = (e, ship) => {
    if (disabled) return;
    const cell = cellAt(e);
    if (cell == null) return;
    // Which segment of the ship was grabbed: it stays under the finger.
    const k = ship.dir === 'h' ? colOf(cell) - colOf(ship.cell) : rowOf(cell) - rowOf(ship.cell);
    drag.current = { ship, k, x: e.clientX, y: e.clientY, moved: false };
    plane.current.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
    d.moved = true;
    const cell = cellAt(e);
    if (cell == null) return;
    const bow = d.ship.dir === 'h' ? { r: rowOf(cell), c: colOf(cell) - d.k } : { r: rowOf(cell) - d.k, c: colOf(cell) };
    if (bow.r < 0 || bow.c < 0 || bow.r >= SIZE || bow.c >= SIZE) { setPreview((p) => (p ? { ...p, ok: false } : p)); return; }
    const ship = { ...d.ship, cell: bow.r * SIZE + bow.c };
    setPreview({ ship, ok: fits(layout, ship) });
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) {
      const p = preview;
      setPreview(null);
      if (p?.ok) { onChange(layout.map((s) => (s.type === p.ship.type ? p.ship : s))); sound('place'); haptic('light'); }
      else refuse(d.ship.type);
      return;
    }
    // A tap turns the ship, around the grabbed segment if possible, else around its bow.
    const dir = d.ship.dir === 'h' ? 'v' : 'h';
    const pivot = d.ship.dir === 'h' ? d.ship.cell + d.k : d.ship.cell + d.k * SIZE;
    const keepsGrab = dir === 'v' ? rowOf(pivot) - d.k >= 0 : colOf(pivot) - d.k >= 0;
    const candidates = [
      ...(keepsGrab ? [dir === 'v' ? pivot - d.k * SIZE : pivot - d.k] : []), // the grabbed cell keeps its place
      d.ship.cell,
    ];
    const turned = candidates.map((cell) => ({ ...d.ship, dir, cell })).find((s) => s.cell >= 0 && fits(layout, s));
    if (turned) { onChange(layout.map((s) => (s.type === turned.type ? turned : s))); sound('pick'); haptic('light'); }
    else refuse(d.ship.type);
  };

  const previewCells = preview ? shipCells(preview.ship.cell, preview.ship.dir, lengthOf(preview.ship.type)) ?? [] : [];

  return (
    <div className="nv-board nv-board--place" style={{ '--tilt': '0deg' }}>
      <div className="nv-stage">
        <div
          className="nv-plane"
          ref={plane}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => { drag.current = null; setPreview(null); }}
        >
          <div className="nv-coords nv-coords--cols" aria-hidden>{Array.from({ length: SIZE }, (_, i) => <span key={i}>{i + 1}</span>)}</div>
          <div className="nv-coords nv-coords--rows" aria-hidden>{LETTERS.split('').map((l) => <span key={l}>{l}</span>)}</div>
          {previewCells.map((c) => (
            <span key={c} className={`nv-place-cell ${preview.ok ? 'is-ok' : 'is-bad'}`} style={{ left: `calc(var(--cell) * ${colOf(c)})`, top: `calc(var(--cell) * ${rowOf(c)})` }} />
          ))}
          {layout.map((ship) => {
            const dragging = preview?.ship.type === ship.type;
            return (
              <div
                key={ship.type}
                className={`nv-shipwrap nv-shipwrap--place ${dragging ? 'is-dragging' : ''} ${dragging && !preview.ok ? 'is-bad' : ''} ${disabled ? 'is-locked' : ''}`}
                style={place(dragging ? preview.ship : ship)}
                onPointerDown={(e) => onDown(e, ship)}
              >
                <motion.div
                  className="nv-shipwrap__inner"
                  animate={shake === ship.type ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
                  transition={{ duration: 0.35 }}
                >
                  <Ship type={ship.type} />
                </motion.div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

