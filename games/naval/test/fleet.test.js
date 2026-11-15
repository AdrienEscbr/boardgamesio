import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLEET, FLEET_CELLS, cellName, fleetError, neighbours, randomFleet, shipCells } from '../src/engine/index.js';

const rngFrom = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

/** A legal fleet: one ship per even row, all from column 0. */
const ROWS_FLEET = FLEET.map(({ type }, i) => ({ type, cell: i * 20, dir: 'h' }));

test('ship cells stay inside the grid', () => {
  assert.deepEqual(shipCells(0, 'h', 3), [0, 1, 2]);
  assert.deepEqual(shipCells(0, 'v', 3), [0, 10, 20]);
  assert.deepEqual(shipCells(95, 'h', 5), [95, 96, 97, 98, 99]);
  assert.equal(shipCells(96, 'h', 5), null); // would wrap onto the next row
  assert.equal(shipCells(70, 'v', 4), null);
  assert.equal(shipCells(-1, 'h', 2), null);
  assert.equal(shipCells(5, 'x', 2), null);
});

test('cell names and neighbours', () => {
  assert.equal(cellName(0), 'A1');
  assert.equal(cellName(99), 'J10');
  assert.equal(cellName(12), 'B3');
  assert.equal(neighbours(0).length, 3);
  assert.equal(neighbours(55).length, 8);
  assert.equal(neighbours(55, { diagonal: false }).length, 4);
});

test('fleet rules: complete, inside, no overlap, no contact', () => {
  assert.equal(fleetError(ROWS_FLEET), null);
  assert.equal(fleetError(ROWS_FLEET.slice(1))?.code, 'FLEET_INCOMPLETE');
  assert.equal(fleetError([...ROWS_FLEET.slice(1), { ...ROWS_FLEET[1] }])?.code, 'FLEET_INCOMPLETE'); // two battleships
  assert.equal(fleetError(null)?.code, 'FLEET_INCOMPLETE');
  const out = ROWS_FLEET.map((s, i) => (i === 0 ? { ...s, cell: 8 } : s));
  assert.equal(fleetError(out)?.code, 'SHIP_OUT_OF_GRID');
  const touching = ROWS_FLEET.map((s, i) => (i === 1 ? { ...s, cell: 10 } : s)); // right under the carrier
  assert.equal(fleetError(touching)?.code, 'SHIPS_TOUCH');
  const diagonal = ROWS_FLEET.map((s, i) => (i === 1 ? { ...s, cell: 15 } : s)); // touches the carrier's stern corner
  assert.equal(fleetError(diagonal)?.code, 'SHIPS_TOUCH');
  const overlap = ROWS_FLEET.map((s, i) => (i === 1 ? { ...s, cell: 2, dir: 'v' } : s));
  assert.equal(fleetError(overlap)?.code, 'SHIPS_OVERLAP');
});

test('random fleets are always legal', () => {
  const rng = rngFrom(7);
  for (let i = 0; i < 500; i++) {
    const f = randomFleet(rng);
    assert.equal(fleetError(f), null);
    const cells = f.flatMap((s) => shipCells(s.cell, s.dir, FLEET.find((x) => x.type === s.type).len));
    assert.equal(new Set(cells).size, FLEET_CELLS);
  }
});
