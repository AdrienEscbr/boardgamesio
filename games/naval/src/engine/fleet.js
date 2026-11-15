// NavalIO fleet geometry: a 10×10 grid, cells numbered 0..99 (row * 10 + col).
// Pure functions, shared by the server and the client (placement screen).

export const SIZE = 10;
export const CELLS = SIZE * SIZE;

/** The fleet every player places, longest first. */
export const FLEET = [
  { type: 'carrier', len: 5 },
  { type: 'battleship', len: 4 },
  { type: 'cruiser', len: 3 },
  { type: 'submarine', len: 3 },
  { type: 'destroyer', len: 2 },
];
export const FLEET_CELLS = FLEET.reduce((n, s) => n + s.len, 0);
export const lengthOf = (type) => FLEET.find((s) => s.type === type)?.len ?? 0;

export const rowOf = (cell) => Math.floor(cell / SIZE);
export const colOf = (cell) => cell % SIZE;
export const isCell = (cell) => Number.isInteger(cell) && cell >= 0 && cell < CELLS;
/** "A1" … "J10": letter = row, number = column. */
export const cellName = (cell) => `${String.fromCharCode(65 + rowOf(cell))}${colOf(cell) + 1}`;

/** Orthogonal and diagonal neighbours of a cell. */
export function neighbours(cell, { diagonal = true } = {}) {
  const r = rowOf(cell);
  const c = colOf(cell);
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      if (!diagonal && dr && dc) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE) out.push(rr * SIZE + cc);
    }
  }
  return out;
}

/**
 * Cells covered by a ship whose bow is at `cell`, extending right ('h') or down ('v').
 * @returns {number[] | null} null when the ship leaves the grid.
 */
export function shipCells(cell, dir, len) {
  if (!isCell(cell) || (dir !== 'h' && dir !== 'v')) return null;
  const r = rowOf(cell);
  const c = colOf(cell);
  if (dir === 'h' ? c + len > SIZE : r + len > SIZE) return null;
  return Array.from({ length: len }, (_, i) => (dir === 'h' ? cell + i : cell + i * SIZE));
}

/**
 * Why this layout is not a valid fleet, or null.
 * Rules: every ship of FLEET exactly once, inside the grid, no overlap, and ships never
 * touch each other, not even diagonally (the usual French rule).
 * @param {{ type: string, cell: number, dir: 'h' | 'v' }[]} layout
 */
export function fleetError(layout) {
  if (!Array.isArray(layout) || layout.length !== FLEET.length) return { code: 'FLEET_INCOMPLETE' };
  const types = layout.map((s) => s?.type);
  if (FLEET.some((s) => types.filter((t) => t === s.type).length !== 1)) return { code: 'FLEET_INCOMPLETE' };
  const owner = new Map(); // cell -> ship type
  for (const s of layout) {
    const cells = shipCells(s.cell, s.dir, lengthOf(s.type));
    if (!cells) return { code: 'SHIP_OUT_OF_GRID', type: s.type };
    for (const c of cells) {
      if (owner.has(c)) return { code: 'SHIPS_OVERLAP', type: s.type };
      owner.set(c, s.type);
    }
  }
  for (const [c, type] of owner) {
    if (neighbours(c).some((n) => owner.has(n) && owner.get(n) !== type)) return { code: 'SHIPS_TOUCH', type };
  }
  return null;
}

/** A valid fleet laid out at random. */
export function randomFleet(rng = Math.random) {
  for (;;) {
    const taken = new Set(); // ship cells and their surroundings
    const layout = [];
    for (const { type, len } of FLEET) {
      let placed = false;
      for (let tries = 0; tries < 300 && !placed; tries++) {
        const dir = rng() < 0.5 ? 'h' : 'v';
        const cells = shipCells(Math.floor(rng() * CELLS), dir, len);
        if (!cells || cells.some((c) => taken.has(c))) continue;
        for (const c of cells) { taken.add(c); for (const n of neighbours(c)) taken.add(n); }
        layout.push({ type, cell: cells[0], dir });
        placed = true;
      }
      if (!placed) break;
    }
    if (layout.length === FLEET.length) return layout;
  }
}
