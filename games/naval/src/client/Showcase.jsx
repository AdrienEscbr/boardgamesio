import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CELLS, FLEET, lengthOf, randomFleet, shipCells } from '../engine/index.js';
import Board from './Board.jsx';
import Ship from './Ship.jsx';
import { SHIP_NAMES } from './i18n.js';
import './naval.css';

const seeded = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const withCells = (fleet) => fleet.map((s) => ({ ...s, cells: shipCells(s.cell, s.dir, lengthOf(s.type)) }));

/** A sea with a hidden (or shown) fleet, and what happens when shells land on it. */
function useSea(seed, { preset = [] } = {}) {
  const make = () => {
    const fleet = withCells(randomFleet(seeded(seed)));
    const received = {};
    for (const c of preset) received[c] = fleet.some((s) => s.cells.includes(c)) ? 'hit' : 'miss';
    return { fleet, received, wrecks: [], fx: [], shells: [] };
  };
  const [sea, setSeaState] = useState(make);
  // The latest sea, readable from callbacks created earlier (a shell lands long after it was fired).
  const ref = useRef(sea);
  const setSea = (next) => { ref.current = typeof next === 'function' ? next(ref.current) : next; setSeaState(ref.current); };
  const next = useRef(1);
  const [banner, setBanner] = useState(null);

  const shoot = (cell, from) => {
    const s = ref.current;
    if (s.received[cell] || s.shells.some((x) => x.cell === cell)) return;
    setSea({ ...s, shells: [...s.shells, { id: next.current++, cell, from }] });
  };
  const land = (id) => {
    const s = ref.current;
    const shell = s.shells.find((x) => x.id === id);
    if (!shell) return;
    const { cell } = shell;
    const ship = s.fleet.find((x) => x.cells.includes(cell));
    const received = { ...s.received, [cell]: ship ? 'hit' : 'miss' };
    const sunk = ship && ship.cells.every((c) => received[c] === 'hit');
    const fxId = next.current++;
    setSea({
      ...s,
      received,
      shells: s.shells.filter((x) => x.id !== id),
      fx: [...s.fx, { id: fxId, cell, kind: sunk ? 'sunk' : ship ? 'boom' : 'splash' }],
      wrecks: sunk ? [...s.wrecks.map((w) => ({ ...w, fresh: false })), { ...ship, fresh: true }] : s.wrecks,
    });
    setTimeout(() => setSea((t) => ({ ...t, fx: t.fx.filter((f) => f.id !== fxId) })), sunk ? 1800 : 1300);
    if (sunk) {
      setBanner({ id: fxId, name: SHIP_NAMES[ship.type] });
      setTimeout(() => setBanner((b) => (b?.id === fxId ? null : b)), 1900);
    }
  };
  const reset = () => { setSea(make()); setBanner(null); };
  return { sea, shoot, land, reset, banner };
}

/** Design review page for NavalIO (/#/dev/naval). */
export default function Showcase() {
  const [tilt, setTilt] = useState(30);
  const enemy = useSea(42);
  const mine = useSea(7, { preset: [5, 33, 47, 58, 76, 91] });
  const myAfloat = mine.sea.fleet.filter((s) => !mine.sea.wrecks.some((w) => w.type === s.type));

  const incoming = () => {
    const open = Array.from({ length: CELLS }, (_, c) => c).filter((c) => !mine.sea.received[c]);
    // Aim at a ship two times out of three, so the hits are visible.
    const onShips = open.filter((c) => mine.sea.fleet.some((s) => s.cells.includes(c)));
    const pool = onShips.length && Math.random() < 0.66 ? onShips : open;
    mine.shoot(pool[Math.floor(Math.random() * pool.length)], 'far');
  };
  const banner = enemy.banner ?? mine.banner;

  return (
    <div className="nv-ocean">
      <div className="nv-review">
        <h1>NavalIO · maquette</h1>
        <p>Cliquez une case de la grille adverse pour tirer : gerbe d’eau dans l’eau, explosion puis incendie sur un navire, et le navire coule quand il est entièrement touché. Les navires adverses sont cachés, comme en partie.</p>
        <div className="nv-review__tools">
          <label>
            Inclinaison {tilt}°
            <input type="range" min="0" max="50" value={tilt} onChange={(e) => setTilt(Number(e.target.value))} />
          </label>
          <button type="button" onClick={incoming}>Recevoir un tir</button>
          <button type="button" onClick={() => { enemy.reset(); mine.reset(); }}>Recommencer</button>
        </div>

        <div className="nv-review__boards">
          <Board
            className="nv-board--mine"
            label="Votre flotte"
            tilt={tilt}
            ships={myAfloat}
            wrecks={mine.sea.wrecks}
            received={mine.sea.received}
            fx={mine.sea.fx}
            shells={mine.sea.shells}
            onLand={mine.land}
          />
          <Board
            className="nv-board--enemy"
            label="Flotte de Robot Ada"
            tilt={tilt}
            wrecks={enemy.sea.wrecks}
            received={enemy.sea.received}
            fx={enemy.sea.fx}
            shells={enemy.sea.shells}
            onLand={enemy.land}
            onCell={(c) => enemy.shoot(c, 'near')}
          />
        </div>

        <h2>La flotte</h2>
        <div className="nv-review__ships">
          {FLEET.map(({ type, len }) => (
            <div key={type} className="nv-review__ship">
              <span>{SHIP_NAMES[type]}<small>{len} cases</small></span>
              <Ship type={type} />
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {banner && (
          <motion.div
            key={banner.id}
            className="nv-banner"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', bounce: 0.45, duration: 0.5 }}
          >
            <strong>Coulé !</strong>
            <span>{banner.name}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
