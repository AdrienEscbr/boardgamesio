// PlanchettesIO pieces. Pure data, shared by server and client.
//
// Sizes are in scene units (1 unit = 3.9 cm). A real planchette is 117 × 23.4 × 7.8 mm:
// proportions 15 : 3 : 1. The balance tower uses thicker blocks; the two construction games
// ('build' and 'free') use planchettes. A scene only ever holds one kind of piece.
//
// A piece travels as a row: [id, x, y, z, qx, qy, qz, qw] (position, then rotation as a
// quaternion). Its local axes are X = length, Y = thickness, Z = width.

export const MODES = ['tower', 'build', 'free'];
export const PLANK = { length: 3, thickness: 0.2, width: 0.6 };
export const BLOCK = { length: 3, thickness: 0.6, width: 1 };
export const CM_PER_UNIT = 11.7 / 3;
export const TOWER_LEVELS = 18;
/** Hard cap on the pieces of a scene (a state message carries all of them). */
export const MAX_BLOCKS = 400;

const piece = (mode) => (mode === 'tower' ? BLOCK : PLANK);
/** Half sizes along the local axes X, Y, Z. */
export const halfSize = (mode) => { const s = piece(mode); return [s.length / 2, s.thickness / 2, s.width / 2]; };

const S = Math.SQRT1_2;
const FLAT = [0, 0, 0, 1];
const FLAT_TURNED = [0, S, 0, S]; // a quarter turn around the vertical axis
const ON_EDGE = [S, 0, 0, S]; // a quarter turn around its length: standing on its long edge
const ON_EDGE_TURNED = [0.5, 0.5, -0.5, 0.5]; // on edge, then a quarter turn around the vertical axis
const GAP = 0.002; // pieces start a hair apart so the physics does not push them away

/** The scene at the start of a round, as rows. Same ids for everyone. */
export function initialBlocks(mode) {
  const rows = [];
  if (mode === 'tower') {
    // 18 levels of 3 blocks side by side, each level across the one below.
    const { thickness: t, width: w } = BLOCK;
    for (let level = 0; level < TOWER_LEVELS; level++) {
      for (let i = -1; i <= 1; i++) {
        const y = t / 2 + GAP + level * (t + GAP);
        const o = i * (w + 2 * GAP);
        rows.push(level % 2 ? [`t${level}_${i + 1}`, o, y, 0, ...FLAT_TURNED] : [`t${level}_${i + 1}`, 0, y, o, ...FLAT]);
      }
    }
    return rows;
  }
  // A small starting tower: two planchettes on edge per level, crossed.
  const { length: l, width: w } = PLANK;
  for (let level = 0; level < 6; level++) {
    for (const side of [-1, 1]) {
      const y = w / 2 + GAP + level * (w + GAP);
      const o = side * (l / 2 - 0.4);
      const id = `s${level}${side > 0 ? 'a' : 'b'}`;
      rows.push(level % 2 ? [id, o, y, 0, ...ON_EDGE_TURNED] : [id, 0, y, o, ...ON_EDGE]);
    }
  }
  return rows;
}

const ID = /^[a-z0-9_]{1,12}$/i;
/** Rows come from a player's browser: check their shape before using them. */
export function validRow(r) {
  if (!Array.isArray(r) || r.length !== 8 || typeof r[0] !== 'string' || !ID.test(r[0])) return false;
  for (let i = 1; i < 8; i++) if (!Number.isFinite(r[i])) return false;
  return Math.abs(r[1]) < 300 && r[2] > -1 && r[2] < 300 && Math.abs(r[3]) < 300
    && Math.abs(r[4]) <= 1.001 && Math.abs(r[5]) <= 1.001 && Math.abs(r[6]) <= 1.001 && Math.abs(r[7]) <= 1.001;
}
