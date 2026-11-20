// MindIO: Mastermind for two. Pure apart from the injected rng; the state is mutated in
// place and a refused action changes nothing.
//
// A code is an array of colour indexes (0 … colors-1), one per peg.
//
// Three modes:
//  duel     each player composes a code for the other, then both decode at the same time.
//  classic  one coder, one decoder; roles swap every round; the coder scores the guesses.
//  race     the game draws one code; both players search it at the same time.
// In duel and race, guesses are simultaneous: a step is resolved once both have played.

export class GameError extends Error {
  constructor(code, details) {
    super(code);
    this.name = 'GameError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export const MODES = ['duel', 'classic', 'race'];
export const FORMATS = {
  classic: { pegs: 4, colors: 6, maxGuesses: 10 },
  expert: { pegs: 5, colors: 8, maxGuesses: 12 },
};
/** Duel and race: round wins needed. Classic: rounds as coder for each player. */
export const TARGETS = [1, 2, 3];
const SIMULTANEOUS = new Set(['duel', 'race']);

// ---------------------------------------------------------------------------
// Codes and feedback
// ---------------------------------------------------------------------------

/** Black = right colour in the right place, white = right colour in the wrong place. */
export function score(secret, guess) {
  let black = 0;
  const left = new Array(16).fill(0);
  const right = new Array(16).fill(0);
  for (let i = 0; i < secret.length; i++) {
    if (secret[i] === guess[i]) black++;
    else { left[secret[i]]++; right[guess[i]]++; }
  }
  let white = 0;
  for (let c = 0; c < 16; c++) white += Math.min(left[c], right[c]);
  return { black, white };
}

export function isValidCode(code, { pegs, colors, duplicates }) {
  if (!Array.isArray(code) || code.length !== pegs) return false;
  if (!code.every((c) => Number.isInteger(c) && c >= 0 && c < colors)) return false;
  return duplicates || new Set(code).size === code.length;
}

export function randomCode({ pegs, colors, duplicates }, rng = Math.random) {
  const pool = [...Array(colors).keys()];
  const code = [];
  for (let i = 0; i < pegs; i++) {
    const k = Math.floor(rng() * pool.length);
    code.push(pool[k]);
    if (!duplicates) pool.splice(k, 1);
  }
  return code;
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

/**
 * @param {{ playerIds: string[], botIds?: string[], settings?: { mode?: string, format?: string,
 *   duplicates?: boolean, target?: number, botLevel?: string, turnSeconds?: number }, rng?: () => number }} opts
 */
export function createGame({ playerIds, botIds = [], settings = {}, rng = Math.random }) {
  if (playerIds.length !== 2) throw new GameError('PLAYER_COUNT', { min: 2, max: 2 });
  const format = FORMATS[settings.format] ? settings.format : 'classic';
  const game = {
    status: 'playing',
    phase: 'compose',
    mode: MODES.includes(settings.mode) ? settings.mode : 'duel',
    format,
    ...FORMATS[format],
    duplicates: settings.duplicates !== false,
    target: TARGETS.includes(settings.target) ? settings.target : 2,
    botLevel: settings.botLevel ?? 'normal',
    turnMs: (settings.turnSeconds ?? 60) * 1000,
    players: playerIds.map((id) => ({ id, isBot: botIds.includes(id) })),
    scores: Object.fromEntries(playerIds.map((id) => [id, 0])),
    roundNumber: 0,
    firstSeat: Math.floor(rng() * 2), // first coder in classic mode; then it alternates
    round: null,
    history: [],
    seq: 0,
    winnerId: null,
    results: null,
  };
  startRound(game, rng);
  return game;
}

/** Number of rounds of a classic game (each player codes `target` times). */
export const classicRounds = (game) => game.target * 2;

const ids = (game) => game.players.map((p) => p.id);
const other = (game, id) => game.players.find((p) => p.id !== id).id;
const isSimultaneous = (game) => SIMULTANEOUS.has(game.mode);

function startRound(game, rng) {
  game.roundNumber += 1;
  const [a, b] = ids(game);
  const r = {
    coderId: null,
    decoders: [a, b],
    // decoderId -> the player who composed the code they search (null: drawn by the game)
    authors: { [a]: b, [b]: a },
    codes: { [a]: null, [b]: null }, // decoderId -> secret
    boards: { [a]: [], [b]: [] }, // decoderId -> [{ code, black, white }]
    submitted: {}, // playerId -> code, for the step being played
    step: 0,
    cracked: [],
    winnerId: null,
    draw: false,
    points: null, // classic: points scored by the coder
  };
  if (game.mode === 'classic') {
    const coder = game.players[(game.firstSeat + game.roundNumber - 1) % 2].id;
    const decoder = other(game, coder);
    r.coderId = coder;
    r.decoders = [decoder];
    r.authors = { [decoder]: coder };
    r.codes = { [decoder]: null };
    r.boards = { [decoder]: [] };
  }
  game.round = r;
  if (game.mode === 'race') {
    const code = randomCode(game, rng);
    r.authors = { [a]: null, [b]: null };
    r.codes = { [a]: code, [b]: [...code] };
    game.phase = 'guess';
  } else {
    game.phase = 'compose';
  }
  game.seq += 1;
}

/** Players who still have to play in the current step. */
export function awaiting(game) {
  if (game.status !== 'playing') return [];
  const r = game.round;
  if (game.phase === 'compose') {
    const composers = game.mode === 'classic' ? [r.coderId] : ids(game);
    return composers.filter((id) => !r.submitted[id]);
  }
  if (game.phase === 'guess') return r.decoders.filter((id) => !r.submitted[id]);
  return [];
}

function check(game, playerId, phase, code) {
  if (game.status !== 'playing') throw new GameError('GAME_OVER');
  if (!game.players.some((p) => p.id === playerId)) throw new GameError('NOT_IN_GAME');
  if (game.phase !== phase) throw new GameError('WRONG_PHASE');
  if (game.round.submitted[playerId]) throw new GameError('ALREADY_PLAYED');
  if (!awaiting(game).includes(playerId)) throw new GameError('NOT_YOUR_TURN');
  if (!isValidCode(code, game)) throw new GameError('INVALID_CODE');
}

/** Composes the secret the opponent will search. */
export function compose(game, playerId, code) {
  check(game, playerId, 'compose', code);
  const r = game.round;
  r.submitted[playerId] = [...code];
  game.seq += 1;
  if (awaiting(game).length) return { waiting: true };
  for (const d of r.decoders) r.codes[d] = [...r.submitted[r.authors[d]]];
  r.submitted = {};
  game.phase = 'guess';
  return { waiting: false };
}

/** Plays a guess; the step is resolved once every decoder has played. */
export function guess(game, playerId, code) {
  check(game, playerId, 'guess', code);
  const r = game.round;
  r.submitted[playerId] = [...code];
  game.seq += 1;
  if (awaiting(game).length) return { waiting: true };

  const out = {};
  for (const d of r.decoders) {
    const g = r.submitted[d];
    const fb = score(r.codes[d], g);
    r.boards[d].push({ code: g, ...fb });
    out[d] = fb;
    if (fb.black === game.pegs) r.cracked.push(d);
  }
  r.submitted = {};
  r.step += 1;
  if (r.cracked.length || r.step >= game.maxGuesses) endRound(game);
  return { waiting: false, feedback: out };
}

function endRound(game) {
  const r = game.round;
  if (game.mode === 'classic') {
    const decoder = r.decoders[0];
    r.points = r.boards[decoder].length + (r.cracked.length ? 0 : 1);
    game.scores[r.coderId] += r.points;
  } else if (r.cracked.length === 1) {
    r.winnerId = r.cracked[0];
    game.scores[r.winnerId] += 1;
  } else {
    r.draw = true;
  }
  game.phase = 'roundOver';
  game.seq += 1;
  game.history.push({
    round: game.roundNumber,
    coderId: r.coderId,
    winnerId: r.winnerId,
    draw: r.draw,
    points: r.points,
    cracked: [...r.cracked],
    guesses: Object.fromEntries(r.decoders.map((d) => [d, r.boards[d].length])),
    codes: Object.fromEntries(r.decoders.map((d) => [d, [...r.codes[d]]])),
  });
}

/** After the pause that shows the finished round: the next round, or the end of the match. */
export function nextRound(game, rng = Math.random) {
  if (game.phase !== 'roundOver') return;
  if (game.mode === 'classic') {
    if (game.roundNumber >= classicRounds(game)) { finish(game); return; }
  } else if (game.players.some((p) => game.scores[p.id] >= game.target)) {
    finish(game);
    return;
  }
  startRound(game, rng);
}

function finish(game) {
  const [a, b] = ids(game);
  const winnerId = game.scores[a] === game.scores[b] ? null : (game.scores[a] > game.scores[b] ? a : b);
  game.status = 'finished';
  game.phase = 'over';
  game.winnerId = winnerId;
  game.seq += 1;
  const ranked = [...game.players].sort((x, y) => game.scores[y.id] - game.scores[x.id]);
  game.results = {
    winnerId,
    ranking: ranked.map((p) => ({
      playerId: p.id,
      rank: 1 + ranked.filter((o) => game.scores[o.id] > game.scores[p.id]).length,
      score: game.scores[p.id],
    })),
    draws: game.history.filter((h) => h.draw).length,
  };
}

// ---------------------------------------------------------------------------
// View: secrets stay secret
// ---------------------------------------------------------------------------

/**
 * What `viewerId` may see:
 *  - the code they search: only once the round is over;
 *  - the code they composed: always (even while waiting for the opponent);
 *  - the opponent's guesses: in duel and classic they are played on the viewer's code (or
 *    in plain sight), in race only their feedback is shown until the round is over;
 *  - nobody's unresolved submission but their own.
 */
export function viewFor(game, viewerId) {
  const r = game.round;
  const over = game.phase === 'roundOver' || game.phase === 'over';
  const waiting = awaiting(game);
  const secrets = {};
  for (const d of r.decoders) {
    const author = r.authors[d];
    let code = r.codes[d];
    if (!code && game.phase === 'compose' && author === viewerId) code = r.submitted[viewerId] ?? null;
    secrets[d] = code && (over || (author === viewerId && author !== null)) ? [...code] : null;
  }
  const boards = {};
  for (const d of r.decoders) {
    const hide = game.mode === 'race' && d !== viewerId && !over;
    boards[d] = r.boards[d].map((row) => ({ code: hide ? null : [...row.code], black: row.black, white: row.white }));
  }
  const mine = r.submitted[viewerId];
  return {
    status: game.status,
    phase: game.phase,
    me: viewerId,
    mode: game.mode,
    format: game.format,
    pegs: game.pegs,
    colors: game.colors,
    maxGuesses: game.maxGuesses,
    duplicates: game.duplicates,
    target: game.target,
    totalRounds: game.mode === 'classic' ? classicRounds(game) : null,
    botLevel: game.botLevel,
    players: game.players.map((p, seat) => ({
      id: p.id,
      isBot: p.isBot,
      seat,
      score: game.scores[p.id],
      submitted: !!r.submitted[p.id],
    })),
    roundNumber: game.roundNumber,
    coderId: r.coderId,
    decoders: [...r.decoders],
    step: r.step,
    secrets,
    boards,
    mySubmission: mine ? [...mine] : null,
    awaiting: waiting,
    myTurn: waiting.includes(viewerId),
    cracked: [...r.cracked],
    roundWinnerId: r.winnerId,
    roundDraw: r.draw,
    roundPoints: r.points,
    history: game.history.map((h) => ({ ...h, guesses: { ...h.guesses }, codes: Object.fromEntries(Object.entries(h.codes).map(([k, v]) => [k, [...v]])) })),
    seq: game.seq,
    winnerId: game.winnerId,
    results: game.results,
  };
}
