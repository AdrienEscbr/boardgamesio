// FFT scoring of a deal ("donne").
import { POINTS_NEEDED } from './cards.js';

export const CONTRACTS = {
  PRISE: { mult: 1, label: 'Petite' },
  GARDE: { mult: 2, label: 'Garde' },
  GARDE_SANS: { mult: 4, label: 'Garde sans' },
  GARDE_CONTRE: { mult: 6, label: 'Garde contre' },
};
export const CONTRACT_ORDER = ['PRISE', 'GARDE', 'GARDE_SANS', 'GARDE_CONTRE'];

/** Trumps (the Excuse may stand in for one) needed for a simple / double / triple poignée. */
export const POIGNEE_THRESHOLDS = { 3: [13, 15, 18], 4: [10, 13, 15], 5: [8, 10, 13] };
export const POIGNEE_LEVELS = ['SIMPLE', 'DOUBLE', 'TRIPLE'];
export const POIGNEE_BONUS = { SIMPLE: 20, DOUBLE: 30, TRIPLE: 40 };

export const CHELEM = { ANNOUNCED_MADE: 400, MADE: 200, ANNOUNCED_FAILED: -200, DEFENSE: -200 };

/** |diff| rounded to the point, a half-point rounding up (e.g. 3.5 → 4). */
const roundPoints = (x) => Math.floor(x + 0.5);

/**
 * @param {object} p
 * @param {keyof CONTRACTS} p.contract
 * @param {number} p.attackHalfPoints  card points won by the attack, in half-points
 * @param {number} p.attackBouts       bouts held by the attack (0..3)
 * @param {'attack'|'defense'|null} p.petitAuBout  team that won the last trick containing the Petit
 * @param {Array<{ level: string }>} p.poignees     every poignée announced in the deal (any team)
 * @param {{ announced: boolean, by: 'attack'|'defense'|null }} p.chelem  `by`: team that took every trick
 * @returns the breakdown and `value`: what each defender pays the attack (negative: the attack pays).
 */
export function scoreDeal({ contract, attackHalfPoints, attackBouts, petitAuBout = null, poignees = [], chelem = { announced: false, by: null } }) {
  const mult = CONTRACTS[contract].mult;
  const realized = attackHalfPoints / 2;
  const needed = POINTS_NEEDED[attackBouts];
  const diff = realized - needed;
  const won = diff >= 0;
  const sign = won ? 1 : -1;

  const base = 25 + roundPoints(Math.abs(diff));
  const contractPoints = sign * base * mult;
  const petitAuBoutPoints = petitAuBout === 'attack' ? 10 * mult : petitAuBout === 'defense' ? -10 * mult : 0;
  // Poignées go to the side that wins the deal, whoever announced them, and are not multiplied.
  const poigneePoints = sign * poignees.reduce((s, p) => s + POIGNEE_BONUS[p.level], 0);
  let chelemPoints = 0;
  if (chelem.by === 'attack') chelemPoints = chelem.announced ? CHELEM.ANNOUNCED_MADE : CHELEM.MADE;
  else if (chelem.announced) chelemPoints = CHELEM.ANNOUNCED_FAILED;
  else if (chelem.by === 'defense') chelemPoints = CHELEM.DEFENSE;

  return {
    contract, mult, realized, needed, bouts: attackBouts, diff, won, base,
    contractPoints, petitAuBoutPoints, poigneePoints, chelemPoints,
    value: contractPoints + petitAuBoutPoints + poigneePoints + chelemPoints,
  };
}

/**
 * Score changes for every player from the attack's value per defender.
 * 3-4 players: the taker collects from each defender. 5 players: the called partner takes
 * one share, the taker the rest (alone: four shares). Always sums to zero.
 */
export function distribute(playerIds, takerId, partnerId, value) {
  const attack = new Set([takerId, partnerId].filter(Boolean));
  const defenders = playerIds.filter((id) => !attack.has(id));
  const out = {};
  for (const id of defenders) out[id] = -value;
  const total = value * defenders.length;
  if (partnerId && partnerId !== takerId) {
    out[partnerId] = value;
    out[takerId] = total - value;
  } else {
    out[takerId] = total;
  }
  return out;
}
